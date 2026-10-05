# EMSBackend.md — Eniac EMS Backend Specification & Build Tracker

> **Deliverable:** a production-grade, professional, industry-standard **Employee Management System (EMS) backend** for Eniac Inc.
> **Location:** all EMS backend code lives in `/home/nikhil/Alpha-net/EMSBackend`.
> **Companion docs:** [`../EMSFrontend/EMSFrontend.md`](../EMSFrontend/EMSFrontend.md) (the frontend contract this backend must satisfy), [`../interface_guide.txt`](../interface_guide.txt) (API guidelines: envelopes, auth, rate limits), [`../flowIntegration.md`](../flowIntegration.md) (staffing domain model), the existing platform API at [`../backend/`](../backend) (architectural sibling to mirror — never modify).
> **Status:** Phases 0–8 DONE (scaffold, Auth, Attendance, Dashboards, HR onboarding/people, Leave+documents, Manager clients/projects/assignments, Finance/reports/notifications/settings/audit, Integration/QA). Phase 8 verification found and fixed 3 live defects — see D-11..D-13.

---

## 0. How to use this document

| Section | Purpose |
|---|---|
| S1 | Executive summary — read first |
| S2 | Scope & non-goals |
| S3 | Tech stack (locked to match the platform backend) |
| S4 | **API design contract — envelopes, auth, errors, idempotency** |
| S5 | Domain model & MongoDB collections (shared-DB, additive) |
| S6 | Roles, billable model & authorization matrix |
| S7 | **Module specifications** (every router: routes, guards, validation, acceptance) |
| S8 | Middleware & cross-cutting plan |
| S9 | Data layer, contract-compatibility & mock-parity strategy |
| S10 | State management, sessions & background jobs |
| S11 | Security rules (server side) |
| S12 | Performance & reliability budget |
| S13 | Target folder structure |
| S14 | **Phased build plan** (Phase 0 - Phase 8) with acceptance gates |
| S15 | **Master progress checklist** (the tracking artefact) |
| S16 | Verification & commands |
| S17 | Risks & open decisions |
| App. A | Envelope + error-code reference |
| App. B | Route → controller → role matrix |
| App. C | Collection + index inventory |
| App. D | Decisions log |

**Effort legend (used in S14 tasks).** Effort: `S` < 1 h, `M` < half day, `L` >= half day. Status: `TODO` / `IN PROGRESS` / `BLOCKED` / `DONE`.

**Non-negotiable rules.**
1. **Additive & non-breaking.** The EMS backend is a NEW service in a NEW folder. It must never modify `backend/`, `frontend/` or `EMSFrontend/`. Connectivity to the timesheet platform is via the **shared MongoDB** (same cluster/database, new collections + additive fields only) and a **compatible API contract**, never via cross-imports.
2. **Mirror the sibling.** Framework, lib names, file layout, middleware ordering, error envelopes, logging, and test conventions are ported from `backend/src` so the two services feel like one product family.
3. **Contract-first.** Every route in S7 must satisfy the `EMSFrontend` service layer (`services/*Service.ts` via the `api` adapter). Where this spec and the frontend expected envelopes disagree, the frontend contract wins for shape and this doc is corrected — backend-only fixes, never frontend-breaking changes.
4. **Mock-parity before wiring.** Phase 0-2 must produce a runnable API with seeded demo data whose responses are field-for-field compatible with `EMSFrontend/src/mocks/fixtures.ts` + `fixtures2.ts`, so flipping `VITE_USE_MOCK=false` is a config change, not a rewrite.
5. **Guideline compliance.** Every API choice must satisfy `interface_guide.txt`. Where this spec and the guide disagree, the guide wins and this doc is corrected.

---

## 1. Executive summary

Eniac today ships **one** backend: the specialized **timesheet platform API** (`backend/`) backed by MongoDB — users, projects, timesheets (weekly + daily), approvals, notifications, documents, reports, invoices, invites, clients, assignments, payrolls. The company needs a **company-wide EMS backend** that owns the whole employment lifecycle — onboarding, attendance, leave, client and project management, assignments, payrates/payroll, reports, notifications, settings — while remaining **tightly coupled** to the timesheet platform through the **shared database**.

This document specifies the **EMS backend**, a new Express + TypeScript + MongoDB service at `/EMSBackend` that:

- Serves **4 roles** — `admin`, `hr`, `manager`, `employee` — with a **capability-derived authorization matrix** (S6) enforced on every route. The timesheet platform's project-scoped `supervisor` is deliberately not modelled here (D-21).
- Implements **Auth** as a first-class, cookie-hardened module (access token in memory on the client, refresh in `httpOnly` cookie, single-flight refresh, invite-redeem, password reset).
- Implements **Attendance** as a first-class daily domain (one mark per user per day, team oversight, historic heatmaps, daily-gate semantics).
- Implements **HR onboarding** — full employee records with **payrate** and **billable/non-billable** classification, pipeline kanban states, department registry, leave + documents.
- Implements the **Manager pipeline** — **Client IDs** to linked **Projects** to **Assignments** (bill/pay/margin).
- Implements **Finance & system** — payroll aggregates + rate-change log, report query engine, notifications, org/user settings, dashboard aggregates (one per role).
- Ships **mock-parity seed data**, **zod validation**, **audited mutations**, **rate-limited auth**, and a **deployable** Node service.

---

## 2. Scope & non-goals

### In scope

1. **EMS API service** (`/EMSBackend/src`): Express routers, controllers, zod schemas, middleware, libs, jobs — covering every endpoint the EMS frontend calls (S7, App. B).
2. **Shared-DB additive model** (S5): reuse `users`, `projects`, `notifications`, `documents`, `activities`, `sessions`, `settings`, `invites`, `invoices`, `clients`, `assignments`, `payrolls`; add `attendance`, `leave_requests`, `leave_types`, `onboarding_candidates`, `payrate_history`, `departments`, `client_contacts`, `client_activity`, `dashboard_snapshots` (optional cache). Additive fields only on shared collections.
3. **Auth & sessions**: login/me/refresh/logout, forgot/reset password, redeem-invite — same cookie + in-memory-token model as the sibling.
4. **Authorization**: role + capability + ownership + admin guardrails (last-admin protection) on every mutating route.
5. **Validation & envelopes**: zod schemas per router, uniform error envelopes, `Retry-After` on 429, JSON-only API.
6. **Seed + fixtures**: `seed:demo` script producing mock-parity data (5 demo users covering every role — admin, hr, manager, employee, contractor — plus clients/projects/assignments/attendance/leave/payroll/notifications). Idempotent: re-running changes no counts. `-- --reset` wipes demo rows first.
7. **Tests**: `vitest` + `supertest` per router (contract + guardrail + validation tests), `typecheck` + `lint` gates.
8. **Deploy**: `DEPLOY.md` + production smoke checklist.

### Non-goals

1. **No changes to `backend/`, `frontend/`, `EMSFrontend/`.** Mismatches are fixed backend-side (adapter/normalizer) and logged as `D-*` decisions.
2. **No timesheet-logging duplication.** Timesheet *writes* stay in the platform backend; EMS exposes read aggregates (`/reports/*`, dashboards) and handoff data only.
3. **No AI chat duplication.** The platform `/ai` router stays canonical.
4. **No realtime sockets in v1.** Notifications are poll-based (`GET /notifications`).
5. **No multi-org tenancy in v1.** Single-org with `orgKey` settings row.
---

## 3. Tech stack (locked to match the platform backend)

| Layer | Choice | Notes |
|---|---|---|
| Runtime / language | Node 22 + TypeScript 5 strict | Same tsconfig shape as backend/ |
| Framework | Express 4 | Same middleware order: cors, helmet, cookieParser, json, rate-limit, routers, notFound, errorHandler |
| Database | MongoDB 6 driver, shared cluster/DB | getDb, COLLECTIONS, ensureIndexes ported; additive indexes only |
| Validation | zod 3 | One schemas file per router; parseOr400 helper |
| Auth | jose JWT + bcryptjs | Access 15 min + refresh 30d httpOnly SameSite Lax Secure in prod, rotation on use |
| Mail | nodemailer | Invite + reset mails; console-transport in dev |
| Uploads | multer memory | Metadata + key only in v1 |
| Logging | pino + pino-http | requestId on every response (X-Request-Id) |
| Rate limiting | express-rate-limit | Global 120/min prod + dual-axis auth limiter (per-user + per-IP) |
| PDF/export | pdfkit | Payroll/report CSV + payslip PDF (Phase 7) |
| Tests | vitest + supertest | npm test per-router files under src/tests/ |
| Lint | eslint sibling config | npm run lint must be clean |
| Deploy | Vercel serverless api/index.ts + Hostinger Node fallback | Same dual-target shape as backend/ |
| Env | dotenv | validateEnv requires MONGODB_URI, MONGODB_DB_NAME, JWT_SECRET, CRON_SECRET |

Commands:

```bash
cd EMSBackend
npm install
npm run dev        # tsx watch src/server.ts (:8787 to match EMSFrontend proxy)
npm run build      # tsc -> dist/
npm start          # node dist/src/server.js
npm run lint       # eslint src
npm test           # vitest run
npm run seed:demo  # tsx src/scripts/seed-demo.ts
npm run typecheck  # tsc --noEmit
```

Env: PORT=8787, MONGODB_URI, MONGODB_DB_NAME (same DB as platform), JWT_SECRET, JWT_ACCESS_TTL=15m, JWT_REFRESH_TTL=30d, CORS_ORIGINS (EMSFrontend prod + localhost:5173), AUTH_RATE_LIMIT_*, MAIL_*.

---

## 4. API design contract

### 4.1 Base + versioning

- Base: `/api/v1`. All EMS routes live here. Only unversioned route is `GET /health -> { status: 'ok' }`.
- JSON-only. `Content-Type: application/json` on writes (except `multipart/form-data` for document upload). `204` only on pure deletes.
- Pagination: `?page=1&limit=20&q=...` -> `{ data, total, page, limit }`. Where the frontend expects named keys (`{ users, total }`, `{ clients, total }`), the backend returns those keys verbatim (see per-route table in 4.2).

### 4.2 Envelopes (must match what frontend services unwrap)

The frontend `apiClient.request()` unwraps one level. Drop-in shapes:

- `GET /auth/me` -> `{ user }`
- `POST /auth/login | /auth/redeem-invite` -> `{ user, accessToken }`
- `GET /employees` -> `{ users, total }`; `GET /employees/:id` -> `{ user, payrateHistory, documents }`
- `GET /onboarding/pipeline` -> `{ pipeline, candidates }`; `POST /onboarding` -> `{ candidate }`
- `GET /departments` -> `{ departments }`
- `GET /leave[?type=]` -> `{ requests, total }`; `GET /leave/types` -> `{ types: [{ value, label }] }`; `POST /leave | PATCH /leave/:id` -> `{ request }`
- `GET /documents[?type=]` -> `{ documents, total }`
- `GET /payrate/history` -> bare array `PayRateHistoryEntry[]`
- `GET /clients` -> `{ clients, total }`; `GET /clients/:id` -> `{ client, projects, contacts, activity }`; `POST /clients` -> `{ client }`
- `GET /projects` -> `{ projects, total }`; `GET /projects/:id` -> `{ project, assignments, team, documents }`; `POST /projects` -> `{ project }`
- `GET /assignments` -> `{ assignments, total }`; `POST /assignments` -> `{ assignment }`; `GET /assignments/demand` -> `{ demands }`
- `POST /attendance/mark` -> `AttendanceRecord`; `GET /attendance/mine?date=` -> summary-or-null; `GET /attendance/mine?start=&end=` -> `{ records }`; `GET /attendance/team` -> `{ records, kpis }`; `GET /attendance/team/historic` -> `{ byUser }`; `DELETE /attendance/mine?date=` -> `204`
- `GET /dashboard/:role` -> role aggregate verbatim (Admin/HR/Manager/EmployeeDashboardData)
- `GET /payroll[?period=]` -> `{ rows, rateChanges, totalGross, period }`
- `POST /reports/query` -> `{ hoursByProject, hoursByEmployee, overtimeStats, statusBreakdown }`; `GET /reports/employee-stats` -> same minus hoursByEmployee
- `GET /notifications` -> `{ notifications, unreadCount }`; `PATCH /notifications/:id/read` -> `204`; `POST /notifications/mark-all-read` -> `204`

Errors: `{ error: { code, message, details? } }` with stable codes (App. A). `429` carries `Retry-After`. `GET /auth/me` without token returns `401 UNAUTHORIZED` so the frontend refresh-first flow triggers.

### 4.3 Auth model (ported from sibling, 5 roles added)

- `POST /auth/login { email, password }` -> sets refresh cookie + `{ user, accessToken }`. Dual-axis rate limit (per-email + per-IP). Generic invalid-credentials message.
- `GET /auth/me` (Bearer) -> `{ user }`.
- `POST /auth/refresh` (cookie) -> rotates refresh, returns `{ accessToken }`.
- `POST /auth/logout` -> clears cookie + deletes session; always 200.
- `POST /auth/forgot-password { email }` -> always 200 (no enumeration).
- `POST /auth/reset-password { token, password }`.
- `POST /auth/redeem-invite { token, password }` -> validates invites row (expiry + single-use), activates user, returns `{ user, accessToken }` + cookie.
- Access 15m HS256 via jose; refresh opaque 64B random sha256-stored, 30d TTL, atomic findOneAndUpdate rotation.

### 4.4 Idempotency, audit, soft-delete

- Idempotency-Key header on POST creates (24h replay).
- Every mutation writes activities row.
- Status transitions, never hard-delete (except unassign + same-day retract, audited).

---

## 5. Domain model & MongoDB collections

### 5.1 Shared-DB principle

MONGODB_DB_NAME is the same database as the platform backend. Existing collections stay read-compatible; EMS adds columns/collections without renames or drops. Legacy-retention rule (ported from backend collections.ts): every pre-EMS field stays supported read-AND-write for >= 2 releases.

### 5.2 Collection inventory

| Collection | Owner | New? | Purpose / key fields |
|---|---|---|---|
| users | shared | extended | Add role, employeeId unique E000###, department, title, status, billable, payRate, currency, employmentType, managerId, joinedAt. `supervisorId` is left platform-owned (D-21).  Indexes: email!, employeeId!, status, department, role (supervisorId stays platform-owned — D-21) |
| invites | shared | extended | Add role, employeeId, department, billable, payRate, currency. tokenHash, expiresAt, redeemedAt |
| password_resets | shared | reuse | tokenHash, userId, expiresAt 1h |
| sessions | shared | reuse | refreshHash, userId, expiresAt TTL, userAgent, ip |
| clients | shared flow P1 | reuse+extend | Add clientCode (EMS `CL-YYYY-NNN`), normalizedName, contactName/email/phone, billingEmail, contractValue. Indexes clientCode!, normalizedName!, status — **corrected in Phase 6**: the spec's `clientId!` was dropped (no row ever wrote `clientId`, and a unique index on an absent field breaks the 2nd insert); `clientCode` is the sole EMS identifier |
| projects | shared | extended | Add clientId ref, sowNumber!, poCap, deadline, skillsRequired, billRateDefault, status. Keep legacy client/hourlyRate/teamMemberIds dual-written. Indexes sowNumber!, clientId, status |
| assignments | shared flow P3 | reuse+extend | userId, projectId, billRate, payRate, currency, ftePercent, roleOnProject, startDate, endDate, status. Indexes (userId,projectId,status), projectId, userId |
| payrolls | shared flow P6 | reuse | **Corrected in Phase 7**: one row PER TIMESHEET { timesheetId, resourceId+userId, projectId, period, grossHours, grossPay, currency, status, closedBy, closedAt }. The spec's per-employee monthly snapshot is impossible against the platform's unique `timesheetId` index (a null `timesheetId` would collide on the 2nd employee). Index timesheetId!, resourceId, assignmentId, status |
| notifications | shared | reuse | { userId, type, title, message, read, relatedId?, createdAt }. **Corrected in Phase 7**: EMS writes/reads `type`/`message`/`relatedId` (the frontend `EmsNotification` shape); the older `body`/`link` columns are still dual-written and `body` is kept as a read fallback, but are never surfaced. Index (userId,read,createdAt-1) |
| attendance NEW | EMS | yes | { userId, date YYYY-MM-DD, status present|remote|on_leave|half_day|late, markedAt, note?, location?, source }. Unique (userId,date). Indexes date, (status,date) |
| leave_requests NEW | EMS | yes | { userId, type, startDate, endDate, days, reason?, note?, status pending|approved|rejected|cancelled, reviewedBy?, reviewedAt? }. Indexes (userId,status), status |
| leave_types NEW | EMS | yes | Seed { value, label }: vacation, sick, personal, unpaid, maternity, paternity — corrected in Phase 5 from an earlier 4-value list (sick/casual/earned/unpaid) to match the `LeaveType` union in EMSFrontend/src/types/hr.ts, per non-negotiable rule 3 |
| onboarding_candidates NEW | EMS | yes | Wizard snapshot + stage invited|docs_pending|payrate_pending|ready|active, draft?, inviteId?. Indexes stage, email |
| payrate_history NEW | EMS | yes | { userId, employeeName, employeeId, oldRate, newRate, currency, reason, changedBy, createdAt }. Index (userId,createdAt-1) |
| departments NEW | EMS | yes | { name! } seed: Engineering, Design, HR, Finance, Delivery, Sales |
| client_contacts NEW | EMS | yes | { clientId, name, email, phone }. Index clientId |
| client_activity NEW | EMS | yes | { clientId, description, actor, timestamp, kind }. Index (clientId,timestamp-1) |
| documents | shared | extended | Add userId?, kind, expiryAt?. Indexes userId, kind |
| activities | shared | reuse | Audit trail. Indexes createdAt-1, (entityType,entityId) |
| daily_timesheets / timesheets | platform | read-only | EMS never writes; aggregates read for dashboards/reports/payroll |
| invoices | shared | read | No EMS writes in v1 |
| settings | shared | extended | orgKey! global row + per-userId rows (org name, leave policy, approval chains) |
| dashboard_snapshots NEW optional | EMS | yes | 5-min TTL cache per role+scope for GET /dashboard/* |
| idempotency_keys NEW | EMS | yes | { key!, response, expiresAt TTL 24h } |

### 5.3 Identifier rules

- employeeId: E + 6 digits, unique, auto-suggest max+1, validated ^E\d{6}$.
- clientCode: `CL-YYYY-NNN` (e.g. `CL-2026-001`), unique, server-generated on POST /clients, scoped to the current year — **corrected in Phase 6** from the original `C + 4 digits (C1001...)`, which contradicted the EMSFrontend contract. In API payloads the client is addressed by its Mongo `_id` string as `clientId`; there is no `clients.clientId` field.
- Dates: YYYY-MM-DD local strings; datetimes ISO UTC. Range math UTC-safe.

---

## 6. Roles, billable model & authorization matrix

### 6.1 Roles (superset of platform admin|user)

`admin | hr | manager | employee`. Platform user rows read as employee (billable decides timesheet access). `isSupervisor` is **never read or written** by EMS — it is platform-owned (D-21).

### 6.2 Capability derivation (server-enforced, mirrors frontend permissions.ts)

| Capability | admin | hr | manager | employee |
|---|---|---|---|---|---|
| manageUsers/onboardEmployee/managePayRates/viewAllEmployees | yes | yes | view-only resources | - |
| manageClients/manageProjects/manageAssignments | yes | - | yes | - |
| reviewTimesheets (read aggregates) | yes | - | - | - |
| viewTeamAttendance/viewTeam | yes | yes | yes (team) | - |
| viewOwnAttendance/markAttendance | - exempt | yes | yes | yes |
| openTimesheetPlatform | yes | - | - | yes |
| viewPayroll/viewReports/viewAuditLog | yes | payroll+reports | reports | own stats only |
| manageSettings | yes org | yes HR-scoped | - | own profile |

inactive users: zero capabilities (all routes 403 except POST /auth/logout).

### 6.3 Enforcement points

- requireAuth on everything except POST /auth/* + GET /health.
- requireRole for namespace routers; requireCapability for fine-grained routes; requireSelfOr for /employees/:id, /leave/:id, /attendance/mine.
- Team scoping: manager sees users WHERE managerId = me; hr/admin see all.
- Admin guardrails (400 LAST_ADMIN): cannot deactivate self; cannot deactivate/demote last active admin.
- Billable guardrail (400 BILLABLE_WITHOUT_RATE / PAYRATE_REQUIRED): billable=true requires payRate > 0 + currency on create/update/onboarding-activate.

---

## 7. Module specifications (routes, guards, validation, acceptance)

> Verb notation: METHOD path — roles — handler. Every POST/PUT/PATCH body validated by schemas/*.schema.ts. Every mutation emits an activities row + relevant notifications.

### 7.1 Auth — /auth/*

- POST /auth/login { email, password } — public dual rate-limit. Returns { user, accessToken } + cookie. Acceptance: wrong creds 401 generic; 429 carries Retry-After; user contains role, employeeId, billable.
- GET /auth/me — auth. Acceptance: valid Bearer -> { user }; missing/expired -> 401 UNAUTHORIZED.
- POST /auth/refresh — cookie. Atomic rotation. Acceptance: replayed refresh 401; new cookie set.
- POST /auth/logout — auth-optional. Acceptance: clears cookie, deletes session, 200 even when already logged out.
- POST /auth/forgot-password { email } — public rate-limited — always 200 + mail if user exists.
- POST /auth/reset-password { token, password } — public — 400 INVITE_INVALID on bad/expired token.
- POST /auth/redeem-invite { token, password } — public — validates invite, enforces billable->payRate rule, activates user, returns { user, accessToken } + cookie.

### 7.2 Attendance — /attendance/* (EMS-new)

- POST /attendance/mark { status, note?, location?, date? } — hr,manager,employee (NOT admin -> 403 ATTENDANCE_EXEMPT) — upsert by (userId,date=today). Acceptance: second mark same day overwrites.
- GET /attendance/mine?date= — self — single-day summary-or-null. GET /attendance/mine?start=&end= — { records } (default last 30d, max 93d).
- DELETE /attendance/mine?date= — self, same-day-only (HR/admin may retract +-7d) — 204.
- GET /attendance/team?date=&scope= — admin,hr,manager — { records, kpis: { on_site, remote, late, on_leave, not_marked } }. Scope team (manager) vs all (admin/hr).
- GET /attendance/team/historic?range=&anchor= — same guards — { byUser } (default range=7, max 31).
- Model: { id, userId, date, status, markedAt, note?, location?, source }. Unique index prevents double rows under race.

### 7.3 Dashboards — /dashboard/:role (aggregate-only, read-heavy)

One endpoint per role; each <= 3 underlying queries, 5-min dashboard_snapshots cache, Cache-Control: private, max-age=60:

- GET /dashboard/admin — admin — { headcount, billableSplit, openClients, activeProjects, attendanceToday, revenueAtRisk, headcountTrend, attendanceRate, projectStatusDonut, recentAudit, integrations, upcomingRenewals, roleDistribution, latestOnboardings }.
- GET /dashboard/hr — hr,admin — { headcount, newThisMonth, pendingOnboardings, onLeaveToday, compliancePct, pipeline, exceptions, payrateChanges, birthdays, anniversaries, leaveCalendar, documentExpiries }.
- GET /dashboard/manager — manager,admin — { activeClients, activeProjects, unassigned, utilizationPct, billableHoursWeek, funnel, assignmentQueue, projectHealth, topClientsByHours, capacityVsDemand }.
- GET /dashboard/employee — any authenticated, self-scoped — { streak, hoursWeek, projectCount, pendingLeave, today, weekHours, myAssignments, documentsToSign, recentNotifications }.
- Acceptance: unknown role path 404; cross-role fetch 403; each <400ms p95 on seed data; empty-org returns zeroed KPIs + [], never null.

- Admin guardrails (400 LAST_ADMIN): cannot deactivate self; cannot deactivate/demote last active admin.
- Billable guardrail (400 BILLABLE_WITHOUT_RATE / PAYRATE_REQUIRED): billable=true requires payRate > 0 + currency on create/update/onboarding-activate.
---

### 7.4 HR Onboarding + People — /onboarding/*, /employees/*, /departments

- GET /onboarding/pipeline — hr,admin — { pipeline: { invited, docs_pending, payrate_pending, ready, active }, candidates }.
- POST /onboarding — hr,admin — wizard payload (6-step superset, server re-validates per-step rules) — creates onboarding_candidates + invites row + mails invite — { candidate }. Billable without rate -> 400 BILLABLE_WITHOUT_RATE.
- POST /employees — hr,admin — direct create (same rules) — { user }.
- GET /employees?q=&page=&limit= — hr,admin,manager read-only — { users, total } (manager gets redacted payRate unless viewPayroll).
- GET /employees/:id — self-or-privileged — { user, payrateHistory, documents }.
- PATCH /employees/:id — hr,admin — guardrails (6.3); payRate change appends payrate_history row.
- GET /departments — auth — { departments }; POST /departments { name } — hr,admin.
- GET /payrate/history — hr,admin — bare array.

### 7.5 Leave + Documents — /leave/*, /documents/*

- GET /leave/types — auth — { types: [{ value, label }] } seeded.
- GET /leave[?type=] — self-list for employee; all/pending-queue for hr,admin — { requests, total }.
- POST /leave { type, startDate, endDate, reason?, note? } — auth — computes days excl. weekends, status=pending — { request }.
- PATCH /leave/:id { status } — hr,admin — sets reviewedBy/At + notifies requester — { request }.
- GET /documents[?type=] — self-or-hr,admin — { documents, total }.
- POST /documents (multipart) — auth — stores metadata { name, kind, userId, expiryAt?, storageKey } — { document }.

### 7.6 Commercial — /clients/*, /projects/*, /assignments/*

- GET /clients — admin,manager — { clients, total }.
- POST /clients — admin,manager — server generates `clientCode CL-YYYY-NNN` + uniqueness retry — { client } + client_activity seed row. Duplicate `normalizedName` -> 409 CONFLICT.
- GET /clients/:id — admin,manager — { client, projects, contacts, activity }.
- POST /clients/:id/contacts — admin,manager — adds client_contacts row.
- GET /projects — admin,manager — { projects, total }.
- POST /projects { name, clientId, sowNumber!, poCap?, startDate, endDate, deadline?, skillsRequired[]?, billRateDefault?, status? } — sowNumber unique -> 409 CONFLICT — { project }.
- GET /projects/:id — { project, assignments, team[{userId,name,role}], documents[] }.
- GET /assignments — admin,manager — { assignments, total } (each with marginPct = (bill-pay)/bill).
- POST /assignments { userId, projectId, billRate, payRate?, currency?, ftePercent?, roleOnProject?, startDate, endDate } — overlap check -> 409 ASSIGNMENT_OVERLAP — dual-writes projects.teamMemberIds — { assignment }.
- DELETE /assignments/:id — admin,manager — 204 + audit.
- GET /assignments/demand — admin,manager — { demands: [{ id, projectName, role, skills[], seats, filled, startDate, endDate }] }.

### 7.7 Finance — /payroll/*, /reports/*

- GET /payroll?period=YYYY-MM — admin,hr view — { rows[{ id, userId, employeeName, role, billable, period, hours, payRate, currency, gross, status }], rateChanges[], totalGross, period } (approved timesheets x payRate; per-timesheet `payrolls` snapshot written on close). Row field names corrected in Phase 7 from the original `grossHours`/`grossPay` to match `EMSFrontend/src/types/payroll.ts`.
- POST /reports/query { dateRange: '7d'|'30d'|'90d'|'custom', startDate?, endDate?, projectId?, userId?, department?, status? } — admin,hr,manager (employee denied -> use /reports/employee-stats) — { hoursByProject, hoursByEmployee, overtimeStats, statusBreakdown }. Filter shape corrected in Phase 7 to the frontend's `ReportFilters` (presets + singular ids), and an absent `status` defaults to `approved`.
- GET /reports/employee-stats — self — { hoursByProject, overtimeStats, statusBreakdown } (no hoursByEmployee; matches `GetEmployeeStatsResponse`).
- Exports: GET /payroll/export?period=&format=csv|pdf, POST /reports/export — content-disposition attachment for downloadBlob.

### 7.8 Notifications + Settings — /notifications/*, /settings/*

- GET /notifications — self — { notifications newest-first max 50, unreadCount }. Read shape is the frontend `EmsNotification` (`type`/`message`/`relatedId`), not the shared collection's legacy `kind`/`body`/`link`; `unreadCount` covers all unread, not just the visible page.
- PATCH /notifications/:id/read — self — 204 (idempotent; 404 for a foreign row). POST /notifications/mark-all-read — self — 204.
- GET /settings/org — admin (+HR-scoped subset for hr) — { settings: { orgName, showBillRateToEmployee, leavePolicy, approvalChain } }.
- PUT /settings/org — admin — validated — { settings }.
- GET /settings/me | PUT /settings/me — self profile subset, partial update (density/theme stay client-localStorage and are never persisted; server stores notification prefs + phone only).

### 7.9 Audit — /audit/* (admin)

- GET /audit?entityType=&entityId=&page=&limit= — admin — { events, total, page, limit }, each event the same `AuditEvent` the dashboard's `recentAudit` emits: `{ id, description, actor, timestamp, severity }`. Reads the append-only `activities` collection newest-first; `total` is the full match count and `limit` clamps to 100. Feeds admin Audit Log + recentAudit widget.
---

## 8. Middleware & cross-cutting plan (ported from sibling)

| Middleware | Order | EMS behavior |
|---|---|---|
| cors | 1 | origin from CORS_ORIGINS split, credentials true |
| helmet | 2 | Default + crossOriginResourcePolicy false for doc downloads |
| cookieParser | 3 | Required before auth (refresh cookie) |
| express.json 1mb + urlencoded | 4 | Same as sibling |
| requestId + pinoHttp | 5 | X-Request-Id echo; warn on >500ms |
| global rateLimit | 6 | 60s / 1000 dev / 120 prod |
| dual-axis authLimiter | 7 on /auth/* only | per-email 30/min prod + per-IP 60/min prod (configurable, NAT-safe) |
| requireAuth | per-router | jose verify -> users.findOne active -> req.user; 401/403 envelopes |
| requireRole / requireCapability | per-route | Capability derived once per request via getCapabilities(user) |
| validate(schema) | per-route | zod.safeParse -> 400 VALIDATION_ERROR { details: fieldErrors } |
| audit(action) | post-mutation | Fire-and-forget activities.insertOne (never fails the request) |
| notFoundHandler | after routers | { error: { code: NOT_FOUND } } |
| errorHandler | last | Pino-logged, 500 INTERNAL in prod (no stack leak), X-Request-Id included |

Mail: invite + reset templates inline. CSRF: cookie SameSite=Lax + Bearer-header pattern means no extra token in v1 (revisit if cookie-write endpoints are called cross-site without Bearer — log D-*).

---

## 9. Data layer, contract-compatibility & mock-parity strategy

1. Port, do not invent. lib/{mongodb,collections,env,origins,jwt,logger,objectid,regex,email}.ts, middleware/{auth,access,error}.ts, app.ts mount order, api/index.ts Vercel export are ported from backend/ then extended (new collections, 5-role guards).
2. Frontend-contract tests first. For every S7 endpoint, a supertest case asserts the exact keys the corresponding *Service.ts unwraps (e.g. GET /employees -> users[] items contain employeeId, role, billable). Seed data mirrors fixtures.ts names/emails so manual mock-to-real diffing is trivial.
3. Adapter policy. If the shared platform shape differs (user vs users), the EMS backend normalizes at the controller boundary — never asks the frontend to change.
4. Dual-writes (shared collections). Assignment create/activate writes projects.teamMemberIds; role changes write emsRole (D-19/D-21); invoice reads expose lineage keys even on legacy rows.
5. No destructive migrations. ensureIndexes creates missing indexes only; any backfill is a versioned scripts/migrate-*.ts with dry-run + rollback note.
6. Idempotency store. idempotency_keys { key!, response, expiresAt TTL 24h }.

---

## 10. State management, sessions & background jobs

- Sessions: sessions rows per refresh token; logout deletes; refresh rotates atomically; nightly cron (CRON_SECRET-guarded POST /internal/cleanup) purges expired.
- No server cache of domain truth. dashboard_snapshots is a best-effort 5-min read-through cache only; mutations invalidate by key prefix.
- Jobs (in-process setInterval in dev, cron in prod): session cleanup, invite-expiry sweep (marks expired, notifies HR), leave auto-escalation stub (notifies HR after 72h pending — v1 notify-only), payroll snapshot on month-close (manual POST /payroll/close admin-only in v1).
- Realtime: none in v1 — frontend polls GET /notifications; bell unreadCount is request-scoped.

---

## 11. Security rules (server side)

1. Passwords bcryptjs(12); never return passwordHash; generic auth errors; timing-safe invite/reset compare.
2. Access 15m, refresh 30d rotation; Secure/HttpOnly/SameSite=Lax cookie; Path=/api/v1/auth.
3. helmet, dual-axis auth rate-limit, global throttle, 1mb body cap, multer 5MB/file + mime allowlist.
4. RBAC on every route (6.3); manager payRate redaction; employee bill-rate visibility behind org flag; team scoping for manager.
5. X-Request-Id on all responses; structured pino logs with userId/role/route/outcome; no PII in logs beyond email-on-auth-fail (warn-level only).
6. Error messages guide the exit: BILLABLE_WITHOUT_RATE -> Set a pay rate before marking this resource billable. ASSIGNMENT_OVERLAP -> already staffed X% during .... LAST_ADMIN -> Assign another admin first.
7. Stable enum strings (present|remote|on_leave|half_day|late, pending|approved|rejected|cancelled, active|inactive|invited|on_leave) so the frontend never string-matches display text.


---

## 12. Performance & reliability budget

| Budget | Target |
|---|---|
| Dashboard aggregate p95 (seed org ~200 users) | <400ms (cached <80ms) |
| List endpoints p95 (page<=20) | <250ms |
| Auth login p95 (bcrypt12) | <600ms |
| Rate-limit + validation overhead | <10ms |
| FMP support | Each dashboard = 1 request (frontend <=3 with notifications) |
| Availability | Stateless app (any replica serves any request); Mongo retry-once on transient |
| Payloads | Lists capped limit<=100; historic range<=31; notifications <=50; Cache-Control private max-age=60 on dashboards |
| Backpressure | express-rate-limit + Retry-After; helmet; graceful SIGTERM drain |

---

## 13. Target folder structure

```
EMSBackend/
├── EMSBackend.md               # this file (plan + tracker of record)
├── DEPLOY.md                   # (Phase 8) Hostinger/Vercel deploy + env + smoke
├── README.md                   # quickstart (points here)
├── package.json                # eniac-ems-backend; scripts: dev/build/start/lint/test/seed:demo/typecheck
├── tsconfig.json               # strict, nodenext (ported from backend/)
├── eslint.config.mjs           # ported from backend/
├── vitest.config.ts            # ported
├── vercel.json                 # api/index.ts serverless target
├── .env.example                # PORT, MONGODB_*, JWT_*, CORS_ORIGINS, MAIL_*, *_RATE_LIMIT_*
├── .gitignore                  # node_modules, dist, .env*
├── api/
│   └── index.ts                # Vercel serverless export (ported)
└── src/
    ├── server.ts               # listen(:8787) + ensureIndexes + graceful shutdown
---

## 14. Phased build plan

### Phase 0 — Scaffold + contract freeze (0.5 day) [x]

- [x] 0.1 Scaffold EMSBackend/ (package.json, tsconfig, eslint, vitest, vercel.json, api/index.ts, src/server.ts, src/app.ts, .env.example, .gitignore, README.md) ported from backend/. S
- [x] 0.2 Port lib/ + middleware/error.ts + GET /health. S
- [x] 0.3 Freeze 4.2 envelope table against EMSFrontend/src/services/* (diff each unwrap vs this doc; correct doc). M
- [x] 0.4 COLLECTIONS + ensureIndexes() additive-only. S
- Gate: npm run dev boots :8787; GET /health -> { status:'ok' }; typecheck/lint clean.

### Phase 1 — Auth + users core (1 day) [x]

- [x] 1.1 schemas/auth.schema.ts + POST /auth/login|/auth/refresh|/auth/logout|GET /auth/me (+ dual-axis limiter, rotation, sessions). M
- [x] 1.2 POST /auth/forgot-password|/auth/reset-password|/auth/redeem-invite + mailer (console in dev). M
- [x] 1.3 middleware/auth.ts (5 roles) + access.ts (requireRole/Capability/SelfOr + capabilities.ts mirror). M
- [x] 1.4 tests/auth.test.ts (login/me/refresh/logout/redeem/rate-limit/guardrail). M
- Gate: frontend Login -> dashboard -> hard-reload -> still signed in -> logout works with VITE_USE_MOCK=false pointed at :8787.

### Phase 2 — Attendance (1 day) [x]

- [x] 2.1 attendance collection + unique (userId,date) + schemas/attendance.schema.ts. S
- [x] 2.2 POST /attendance/mark|GET /attendance/mine|DELETE /attendance/mine (admin-exempt 403). M
- [x] 2.3 GET /attendance/team|/attendance/team/historic + KPI derivation + team scoping. M
- [x] 2.4 tests/attendance.test.ts (overwrite-not-duplicate, exempt-admin, KPI math, scoping). S
- Gate: banner -> mark -> undo -> heatmap -> roster all work against real API.
---

### Phase 3 — Dashboards (1.5 days) [x]

- [x] 3.1 lib/dashboard/aggregators.ts — 4 role aggregators (admin, hr, manager, employee) with 5-min snapshot cache. L
- [x] 3.2 GET /dashboard/:role x5 + dashboard_snapshots 5-min cache + invalidation. M
- [x] 3.3 tests/dashboards.test.ts (shape parity vs types/dashboard.ts, 403 cross-role, empty-org zeros, 22 tests). M
- Gate met: 72/72 tests pass (50 auth+attendance + 22 dashboard); 0 typecheck errors; 0 lint errors.

### Phase 4 — HR: onboarding & people (2 days) [x]

- [x] 4.1 onboarding_candidates + invites(extended) + departments + POST /onboarding|GET /onboarding/pipeline. M
- [x] 4.2 GET|POST /employees|GET|PATCH /employees/:id (+ guardrails, payRate->history dual-write, manager redaction). L
- [x] 4.3 GET|POST /departments, GET /payrate/history. S
- [x] 4.4 tests/onboarding-employees.test.ts (wizard-create to directory-visible, billable-without-rate 400, last-admin 400). M
- Gate: 18/18 Phase 4 tests pass; 0 typecheck errors; 0 lint errors.

### Phase 5 — Leave + documents (1 day) [x]

- [x] 5.1 leave_types(seed) + leave_requests + GET /leave/types|GET|POST /leave|PATCH /leave/:id (+ reviewer notify). M
- [x] 5.2 documents(extended) + GET /documents|POST /documents(multipart) metadata-first. M
- [x] 5.3 tests/leave-documents.test.ts. S
- Gate met: 140/140 tests pass (90 prior + 50 new); 0 typecheck errors; 0 lint errors. request -> approve -> notify verified end-to-end; expiry widget fed by `expiryAt` with derived `status: expired`.

**Phase 5 implementation notes**

| Concern | Decision |
|---|---|
| Leave types | Seeded to the 6 frontend `LeaveType` values (doc corrected in S5.2). `seedLeaveTypes()` runs at bootstrap with `$setOnInsert`, so operator-renamed labels survive restart; `getLeaveTypes()` returns canonical ordering and falls back to the in-code list on a cold DB without writing on read. |
| Day count | `countLeaveDays()` counts weekdays inclusively; weekend-only range -> 400 `INVALID_RANGE`. `days` and `status` are never accepted from the client. |
| Overlap | `POST /leave` rejects an overlapping pending/approved request -> 409 `LEAVE_OVERLAP`. |
| Review | `PATCH /leave/:id` is guarded by `requireRole('admin','hr')` (R-4: v1 is hr+admin only) and pins the update filter to `status: 'pending'`, so a concurrent double-approval cannot overwrite. Terminal states only — `pending` is not a valid target. Sets `reviewedBy`/`reviewedAt`/`reviewNote` and fires `createNotification` to the requester. |
| Document scoping | `GET /documents` is self-scoped via `$or [userId, uploadedBy]` for non-reviewers, org-wide for hr/admin. `POST /documents` lets any authenticated user write their own row, but targeting another employee via the `userId` field is hr/admin-only — otherwise an employee could attach a forged contract/visa to someone else's profile. |
| Metadata-first | `POST /documents` validates metadata before writing and stores only the row (`name, kind, userId, expiryAt?, storageKey` + `size, mimeType, uploadedBy, status`). Bytes are deliberately not persisted — see R-5 / D-9. |
| Shared-collection safety | `uploadedBy` is stored as an **ObjectId** (the platform backend's convention for the same collection) and surfaced as a string plus an additive `uploadedByName`. `projectId` is written as explicit `null` so the platform's index expectations hold. `storageKey` collapses dot runs and strips leading dots so no `..` segment can survive into a future blob path. |
| Side benefit | `getEmployeeDetail` now returns `EmsDocument[]` via the shared `toEmsDocument()` mapper instead of leaking raw Mongo rows (it previously typed them `any[]`). |

### Phase 6 — Manager: clients, projects, assignments (2 days) [x]

- [x] 6.1 POST|GET /clients|GET /clients/:id(+projects/contacts/activity)|POST /clients/:id/contacts (server C####). M
- [x] 6.2 POST|GET /projects|GET /projects/:id(+assignments/team/documents) (sowNumber! -> 409). M
- [x] 6.3 POST|GET /assignments|DELETE /assignments/:id|GET /assignments/demand (overlap 409, margin calc, teamMemberIds dual-write). L
- [x] 6.4 tests/commercial.test.ts (client->project->assign->team-visible-in-platform-shape). M
- Gate met: 196/196 tests pass (140 prior + 56 new); 0 typecheck errors; 0 lint errors; build clean. Live MongoDB run of the full client -> project -> assignment pipeline passed 48/48 checks (scratch DB, dropped afterwards; shared `eniac_ems` untouched), including platform read-back of `resourceId`/`billingType`/`timesheetRequired`/`approvalRequired`, roster `teamMemberIds`, `poSow`, and `normalizedName`.

**Phase 6 implementation notes**

| Concern | Decision |
|---|---|
| Client identity | `clientCode` (`CL-YYYY-NNN`, server-generated, current-year scoped) is the only EMS client identifier. No `clients.clientId` is created — the platform has no such field and inventing one would fork the row. `clientId` in the API is the Mongo `_id` string. |
| Duplicate clients | Matched on `normalizedName` (platform-owned, lowercased/trimmed name) rather than a second key. -> 409 `CONFLICT`, per the §631 error table. A duplicate-key race on the unique `normalizedName` index is caught and retried against the same code path. |
| Project legacy mirroring | `client` mirrors the client **name** (string) and `hourlyRate` mirrors EMS `billRateDefault`; `sowNumber` is stored as-is and is the 409 collision key. `seats`, `roleOnProject`, `skillsRequired` are EMS-only additions on the shared row. |
| Assignment dual-write | Every assignment stores **both** `resourceId` (platform vocabulary) and `userId` (EMS/frontend vocabulary) as ObjectIds, so either service's own queries resolve the row. Reads filter with `$or: [{resourceId}, {userId}]` for the same reason. |
| Platform-required fields | `billingType: 'hourly'` (fixed in v1), `timesheetRequired: true`, `approvalRequired: true` are always written; `poSow` is mirrored from the project's `sowNumber` when present. |
| Status vocabulary | Stored **platform-native** (`active\|onHold\|completed\|terminated`) because the platform filters `status:'active'` to resolve an assignment for a timesheet. `toAssignment()` translates on read to the frontend vocabulary, deriving `ending_soon` when an active assignment ends within 14 days. |
| Status filtering | Frontend status maps to stored values (`proposed->onHold`, `ended->{completed,terminated}`). `ending_soon` is derived, not stored, so it filters on `active` and is **post-filtered** in `listAssignments`. |
| Overlap guard | Stricter than the platform: the platform only prevents two `active` rows per (resource, project), while EMS rejects any overlapping **live** (`active`/`onHold`) assignment for one resource across all projects, -> 409 `ASSIGNMENT_OVERLAP`. A follow-on non-overlapping assignment is allowed. |
| Roster dual-write | Creating an active assignment adds the resource to `projects.teamMemberIds` with `$addToSet` (additive + idempotent). It is deliberately **not** reversed on terminate — the platform's `addResourceToProject` treats the roster as append-only. |
| `payRate` inheritance | Omitted `payRate` falls back to the employee's `payRate`; `currency` falls back to the employee's, then `USD`. `marginPct` is always derived as `(billRate - payRate)/billRate`, never client-supplied. |
| Manager scoping | `GET /attendance/team` and `GET /assignments` scope a manager to users whose `managerId` is them, via `getTeamMemberIds`. |
| Demand | `GET /assignments/demand` is gated on `manageProjects`, which admin **and** manager both hold (§6.2 — mirrored from `permissions.ts`); `seats` defaults to 1 when a project omits it. |

### Phase 7 — Finance, reports, notifications, settings, audit (2 days) [x]

- [x] 7.1 GET /payroll|GET /payroll/export|POST /payroll/close + payrollcalc.service + pdfkit/csv. M
- [x] 7.2 POST /reports/query|GET /reports/employee-stats|POST /reports/export + reportquery.service. M
- [x] 7.3 GET|PATCH /notifications (+cap 50, unreadCount) + bell-parity test. S
- [x] 7.4 GET|PUT /settings/org|GET|PUT /settings/me + GET /audit (admin). S
- [x] 7.5 tests/finance-reports.test.ts + notifications-settings-audit.test.ts. M
- Gate met: 280/280 tests pass (196 prior + 84 new); 0 typecheck errors; 0 lint errors; build clean. Live MongoDB run passed 90/90 checks (scratch DB, dropped afterwards; shared `eniac_ems` untouched): a period closed from approved timesheets only, snapshot rows re-read by the platform, CSV + real `%PDF` downloads, report export, bell read/mark/mark-all with cross-user 404, org + personal settings round-trip, and every Phase 7 mutation visible in `/audit`.

**Phase 7 implementation notes**

| Concern | Decision |
|---|---|
| Payroll field names | The spec's `{userId, name, employeeId, grossHours, grossPay}` was **corrected** to the frontend's `{id, userId, employeeName, role, billable, period, hours, payRate, currency, gross, status}` (`types/payroll.ts`), since `AdminPayrollPage` unwraps it directly. |
| Payable hours | Only `approved` timesheets count. A draft/pending week is not a payroll event, and declined/withdrawn weeks were rejected work — paying them would put unapproved time on a payslip. |
| Timesheet shape | The platform stores weekly rows with pre-computed `regularHours`/`overtimeHours`/`totalHours` and a `weekStart` string, so payroll matches the period by `weekStart` prefix and never re-derives hours from `entries[]`. |
| Snapshot granularity | `POST /payroll/close` writes **one `payrolls` row per timesheet**, not per employee. The platform's unique `payrolls.timesheetId` index makes a per-employee row impossible: `timesheetId` would be null and a unique index admits at most one null, so the second employee would fail E11000. Rows dual-write `resourceId` + `userId` like assignments. |
| Close idempotency | Close upserts on `timesheetId` with `$setOnInsert: createdAt`, so re-closing a period updates rather than duplicates. `rows` then read `approved` instead of `draft`; an empty period is 422 `PAYROLL_EMPTY`. |
| Period default | `GET /payroll` with no `period` returns the **previous** calendar month — payroll is retrospective. |
| Report filters | `POST /reports/query` takes the frontend's `ReportFilters` (`dateRange` preset + singular `projectId`/`userId` + `department`/`status`), not the spec's `{from, to, projectIds[], userIds[]}`. `dateRange: 'custom'` without both dates, or an inverted range, is 400 `INVALID_RANGE`. |
| Report status default | An **absent** `status` means `approved`, never "everything". Only an explicit `all` opts out. This is the QA M8 defect the frontend type documents (draft/declined/withdrawn weeks counted as worked hours) — caught by the live E2E, not by the mocked tests. |
| `statusBreakdown` | Computed **without** the status filter, so it always shows the full five-way distribution; the hours figures still respect the filter. Honouring it would zero out four of five bars and make the chart useless. |
| `department` filter | Lives on the user, not the timesheet, so it resolves to a user-id set first (one indexed `users.find`) rather than an unindexed join. An empty match yields an empty report, not everything. |
| Notification vocabulary | The mapper exposes only `type`/`message`/`relatedId` (frontend), never the shared legacy `kind`/`body`/`link`, with `body` as a read fallback for rows written before `message` existed. `type` falls back to `user` for legacy rows missing it. |
| `unreadCount` | Counts the **whole** unread set, not just the visible 50, so the bell badge stays truthful past the cap. |
| Mark-read | Self-scoped and idempotent: an already-read row still returns 204 (a bell can fire twice), while a missing or foreign row is an indistinguishable 404. `mark-all-read` is declared before the `/:id` routes so it can never be parsed as an id. |
| Settings split | Org row is keyed by the unique `orgKey: 'global'` (admin writes; admin + hr read — HR needs the leave policy); personal rows are keyed by `userId` with **partial** updates, so a phone-only PUT cannot silently reset notification prefs. Both read defaults without writing on a cold DB. |
| Theme + density | Never stored server-side — `SettingsPage` reads them from the Theme/Density contexts (localStorage). Only `phone` + notification prefs persist. |
| Audit shape | Reuses the `AuditEvent` shape the Phase 3 dashboard already emits for `recentAudit` (`id, description, actor, timestamp, severity`), so one mapper serves both. `actor` is resolved from `activities.userId` via one batched lookup instead of the older flat `actor` string. `total` is the full match count, not the page length, and `limit` clamps to 100 rather than erroring. |

### Phase 8 — Integration wiring, polish, QA, deploy (2 days) [ ]

- [x] 8.1 seed:demo mock-parity pass (names/emails/counts match fixtures*.ts); EMSFrontend VITE_USE_MOCK=false -> fix backend-shape-only mismatches. M
- [x] 8.2 Cross-platform verification: create Client/Project/Assignment in EMS -> confirm visibility in timesheet platform (document result in App. D). M
- [x] 8.3 Empty/error/edge sweep (empty org, expired invite, overlap, last-admin, double-mark race). M

#### 8.2 Cross-platform verification — result (D-8)

Verified by running **both** services against one MongoDB and driving each service's **own HTTP API** — no direct database inspection was used to bridge the two. Originally run with the platform's URI overridden to a scratch EMS database; re-confirmed against the shared Atlas `alphanet` deployment now that both services point at it (D-15). `backend/.env` was not modified.

**33/33 checks passed.** The chain that proves interoperability, not merely visibility:

| Step | Actor | Result |
|---|---|---|
| Login | EMS | seeded admin `admin@eniac.demo` → 200 |
| Login | platform | **same** credentials → 200, issues its own token |
| `POST /clients` | EMS | 201, generated `CL-2026-004` |
| `POST /projects` | EMS | 201, mirrored `client` + `hourlyRate` |
| `POST /assignments` | EMS | 409 on an overlapping window (guard holds), 201 on a free one |
| `GET /clients` | platform | sees the EMS-created client, same name |
| `GET /projects` | platform | sees it, reads mirrored `client` + `hourlyRate: 175` |
| `GET /assignments` | platform | sees it, resolves via `resourceId`; `status: active` (platform-native), `billingType: hourly` |
| `POST /timesheets` | platform, **as Esha** | 201 — an ordinary employee bills against an EMS-created assignment |
| `POST /timesheets/:id/submit` | platform | 200 (draft → submitted) |
| `POST /approvals/:id/approve` | platform, as admin | 200 |
| `GET /payroll?period=…` | EMS | 40 h × $85 = **$3,400** — approved platform hours flow back into EMS payroll |

Two contract details worth keeping: a timesheet is filed **by its own resource** (the platform scopes an assignment to `userId`, not to the caller, and answers `Assignment does not belong to this resource` otherwise), and the reviewer action lives on the platform's approvals queue (`/approvals/:id/approve`, `requireTimesheetReview`), not on `/timesheets/:id/approve`.

#### 8.3 Edge sweep — result

Run against a **freshly dropped** database so "empty org" was genuinely empty. **29/29 passed.**

- **Empty org** — all 14 read surfaces return `200` with empty/zero payloads (4 dashboards, employees, clients, projects, assignments, attendance, leave, documents, notifications, audit, reports, payroll). No 500s, no null dereferences.
- **Expired invite** → `400 INVITE_INVALID` ("Invalid or expired invite token"), not a server error. A live invite redeems `200`; **replaying it is rejected** (single-use).
- **Last admin** — demote → `400 LAST_ADMIN`; deactivate → `400 LAST_ADMIN`; self-delete refused. The guard **lifts** once a second admin exists (`200`), confirming it counts admins rather than hard-blocking.
- **Double-mark race** — 5 concurrent `POST /attendance/mark` for the same person/date: all `200`, **exactly 1** stored record (`findOneAndUpdate` upsert). 5 concurrent `PATCH /notifications/:id/read`: all `204`, notification ends up read exactly once.
- **Assignment overlap** → `409 ASSIGNMENT_OVERLAP`.

> **Sweep value:** the first edge run failed all 5 concurrent marks with `500`, which surfaced **D-11** — the attendance endpoint had never actually worked. Unit tests could not catch it (see D-11).

#### Accepted-out

- **Aggregate hour parity is impossible.** `MOCK_HOURS_BY_PROJECT` totals **412** while `MOCK_HOURS_BY_EMPLOYEE` totals **388** — the frontend fixtures contradict each other by 24 h. Seeded per-employee and per-project totals therefore cannot both match. Left as-is rather than silently forcing one total to match the other.
- **`DEPLOY.md`** (Hostinger/Vercel) not written: it needs a real hosting target, credentials-free deploy validation, and a domain decision. Nothing in Phases 0–7 depends on it.
- **Document blob wiring** deferred per D-9/R-5.
- **Demo data is confined to scratch databases.** `alphanet` contains only real accounts (D-17); `seed:demo` refuses to target it. Run it against `MONGODB_DB_NAME=<scratch>` until a separate demo Atlas cluster exists.

---

## 15. Master progress checklist

> Tracker of record. Legend: [ ] todo, [~] in progress, [x] done, [!] blocked, [-] accepted-out.

### Foundation (Phase 0)

- [x] EMSBackend/ folder + scaffold (package/tsconfig/eslint/vitest/vercel/api/server/app/env/readme)
- [x] GET /health + lib ports + additive COLLECTIONS/ensureIndexes
- [x] 4.2 envelope freeze vs EMSFrontend/src/services/*

### Auth & access (Phase 1)

- [x] Login/refresh/logout/me + dual-axis rate limit + rotation
- [x] Forgot/reset/redeem-invite + mailer
- [x] requireAuth/Role/Capability/SelfOr + capabilities.ts mirror + guardrails
- [x] tests/auth.test.ts green + frontend bootstrap gate

### Attendance (Phase 2)

- [x] attendance collection + unique index
- [x] Mark/mine/retract (admin-exempt)
- [x] Team + historic + KPIs + scoping
- [x] tests/attendance.test.ts green

### Dashboards (Phase 3)

- [x] 5 aggregators + GET /dashboard/:role + snapshot cache
- [x] Shape-parity + 403 + empty-org tests green; p95 budget met

### HR module (Phase 4)

- [x] Onboarding wizard-create + pipeline kanban data + invites mail
- [x] Employees directory/detail/edit + guardrails + payrate history
- [x] Departments + payrate-history endpoints
- [x] tests/onboarding-employees.test.ts green

### Leave + documents (Phase 5)

- [x] Leave types/list/create/review + notifications
- [x] Documents list/upload (metadata-first)
- [x] tests/leave-documents.test.ts green

### Manager module (Phase 6)

- [x] Clients list/create/detail + C#### + contacts/activity
- [x] Projects list/create/detail + sowNumber!
- [x] Assignments board-data + overlap guard + margin + demand + dual-write
- [x] tests/commercial.test.ts green + shared-DB visibility verified

### Finance / system (Phase 7)

- [x] Payroll + close + CSV/PDF export
- [x] Reports query + employee-stats + export
- [x] Notifications + settings (org/me) + audit log
- [x] Finance/system tests green

### Integration & release (Phase 8)

- [x] `src/scripts/seed-demo.ts` — idempotent, tag-scoped `--reset`, `--reset` re-run safe
- [x] Mock parity vs `EMSFrontend` fixtures (names, emails, counts, SOW numbers)
- [x] Cross-platform verification against the platform's own HTTP API (33/33)
- [x] Empty/error/edge sweep against a fresh DB (29/29)
- [x] `tests/phase8-hardening.test.ts` — regressions for D-11..D-13
- [x] Quality gate: typecheck clean, lint 0 errors, build clean, 286/286 tests
- [-] `DEPLOY.md` (Hostinger/Vercel deploy) — not written; blocked on a real hosting target
- [-] Document blob wiring (R-5 `storageKey`) — deferred, see D-9

---

## 16. Verification & commands

```bash
cd EMSBackend
npm install
npm run dev
npm run typecheck
npm test
npm run seed:demo          # idempotent
npm run seed:demo -- --reset  # wipe demo rows first (tag-scoped, D-14)
```

Contract check (after seed:demo — every frontend service path must 200/401, never 404):

```bash
for p in auth/me employees onboarding/pipeline departments leave leave/types documents clients projects assignments attendance/mine payroll notifications dashboard/admin dashboard/hr dashboard/manager dashboard/employee reports/employee-stats; do
  echo "== $p"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/api/v1/$p
done
```

Frontend flip check: point EMSFrontend at :8787 with VITE_USE_MOCK=false, then Login, dashboard, attendance-mark, HR wizard, manager pipeline, payroll, bell.
---

## 17. Risks & open decisions

| ID | Risk / question | Mitigation / default |
|---|---|---|
| R-1 | Shared-DB write conflicts (dual-write drift) | Additive-only; idempotent dual-writes; nightly verify diff (Phase 8) |
| R-2 | Dashboard aggregations slow on large orgs | Snapshot cache + capped limits + covered indexes |
| R-3 | billable/payRate rule blocks legacy users | Rule applies to EMS creates/activations only; legacy rows untouched |
| R-4 | Leave-approval scope | v1: hr,admin only. The supervisor role is gone from EMS (D-21), so there is no supervisor-team approval path to defer. |
| R-5 | File bytes for documents | Metadata-first (Phase 5, D-9): the row is the source of truth for metadata/expiry; `storageKey` is reserved for the platform blob store. Blob wiring is Phase 8. Filing a document *for another employee* is hr/admin-only. |
| R-6 | Cookie CSRF on cross-site prod | SameSite=Lax + Bearer-required; revisit if model changes |
| D-1 | Employee bill-rate visibility | Org flag showBillRateToEmployee (default OFF) |
| D-2 | Attendance late — who sets it? | Phase 7 job marks after 10:00 local as late; v1 accepts client-sent late |
| D-3 | Leave balance accounting | v1 informational (no accrual ledger) |
| D-4 | Multi-org | Single-org v1; orgKey reserved |
| D-5 | Employee identifier | `clientCode` is the sole EMS client identifier (platform `clientId` string). Assignments dual-write `resourceId` + `userId`. Platform-native statuses are stored as-is and translated on EMS read. |
| D-6 | Payroll close granularity | One snapshot row per timesheet, forced by the unique `payrolls.timesheetId` index. Rows expose `hours`/`gross`; `statusBreakdown` intentionally ignores the active status filter; `GET /reports/employee-stats` omits `hoursByEmployee`; . |
| D-7 | Demo seed natural keys | users→email, clients→normalized name, projects→SOW number, assignments→(userId, projectId), timesheets→(userId, weekStart). Password `EniacDemo!2026`, overridable via `SEED_DEMO_PASSWORD`. `platformRole` is `admin` only for the `admin` fixture, else `user`. |
| D-8 | Cross-platform verification result (8.2) | **Verified working end-to-end** against the platform's own HTTP API on one shared DB — 33/33 checks. See the "8.2 Cross-platform verification" note below. |
| D-9 | Document bytes | Metadata-first; `storageKey` reserved for the platform blob store. Blob wiring deferred. |
| D-10 | Leave type vocabulary | 6 frontend `LeaveType` values (vacation, sick, personal, unpaid, maternity, paternity), not the original 4. Rule 3: the frontend contract wins. |
| D-11 | `POST /attendance/mark` returned 500 for every request | `attendance.service.ts` read `result?.value` from `findOneAndUpdate`. Driver `mongodb@6` returns the document directly (the `{ value }` wrapper is v5 / `includeResultMetadata`). The endpoint was fully broken in production; the unit suite missed it because its mock reproduced the v5 shape. Fixed to the v6 contract, mocks corrected so the drift cannot recur. |
| D-12 | `sessions.refreshHash` unique index blocked platform logins | EMS created a **non-partial** unique index on a field the platform's session documents omit. A unique index treats a missing field as `null`, so the platform's second login always collided with its own first (`E11000`). Now `partialFilterExpression: { refreshHash: { $type: 'string' } }`, which keeps EMS's rotation guarantee without monopolising a shared collection. `ensureIndexes` drops a pre-existing non-partial index first, because `createIndex` raises `IndexOptionsConflict` on the same name with different options. |
| D-13 | Shared-collection mappers must tolerate non-BSON timestamps | `users` is written by both services. `toEmsUser` called `createdAt.toISOString()` directly, so one row holding an ISO string 500'd the entire directory listing; `joinedAt` had the same latent flaw. Both now go through tolerant `toDate`/`toDay`/`toIso` helpers that accept a `Date`, an ISO string, or nothing and degrade to `undefined`. |
| D-14 | `seed-demo --reset` scope | Tag-scoped (`seedTag: 'seed:demo'`) deletion across every seeded collection. Deleting only the natural-key parents orphaned their children, and the next run's upserts then matched fresh `_id`s, silently doubling every dependent collection. `leave_types` and `settings` stay untagged: they are org-wide config owned by `seedLeaveTypes()`. |
| D-15 | Both services share one Atlas database | **Resolved 2026-10-04.** `EMSBackend/.env` now uses the same Atlas URI and `MONGODB_DB_NAME=alphanet` as `backend/.env`, matching `.env.example`. `JWT_SECRET` is shared too — without it the two services could read the same rows but reject each other's tokens, which defeats the point. Verified live: both services boot against `alphanet`, repeated logins succeed on both, and a token minted by either service authenticates on the other (200 in both directions). `backend/.env` was **not** modified. |
| D-16 | Unique indexes on shared collections must be partial | Repointing EMS at the real `alphanet` data broke `ensureIndexes`, twice. Every pre-existing platform row predates the EMS extension fields: all 4 `clients` lack `clientCode`, both `invites` lack `tokenHash`. A plain unique index cannot even be **built** over those (`E11000` at index-build time), which threw out of `ensureIndexes` and left every collection declared after the failure **unindexed** — a half-migrated deployment. All three such indexes now go through one `ensurePartialUnique()` helper that scopes uniqueness to rows genuinely holding the value and migrates a pre-existing non-partial index. Covered: `sessions.refreshHash`, `clients.clientCode`, `invites.tokenHash`. Audited all 17 unique indexes against live `alphanet`; these were the only conflicts. |
| D-17 | Demo accounts must never reach the shared database | `seed-demo.ts` now hard-refuses to target the platform database (`alphanet` by default, override with `PLATFORM_DB_NAME`) unless `SEED_ALLOW_SHARED_DB=true`. The six fixtures share the password `EniacDemo!2026`, so seeding them beside real employees would put live data behind publicly known credentials. The guard runs before `ensureIndexes()`, so a refused run touches nothing. | Requested after repointing EMS at Atlas: only real Atlas accounts should remain. Verified — `alphanet` holds 12 accounts, all real, 0 demo-tagged rows; the leftover `eniac_ems_seedtest` scratch database was dropped from the shared cluster; the guard refuses `alphanet` and still seeds a scratch database normally. |
| D-18 | `/departments` and `/payrate/history` were served under the wrong prefix | The handlers were registered inside `peopleRoutes()`, so they were only reachable at `/api/v1/employees/departments` and `/api/v1/employees/payrate/history` — but EMSFrontend calls the top-level `/departments` and `/payrate/history`, which §4 and §7.4 freeze as top-level. Both requests returned **404**, so employee edit and pay-rate management had no department or pay-rate-history source. Added `routes/departments.ts` and `routes/payrate.ts` mounted at the contract paths; the `/employees/*` aliases still work. Found by probing every frontend service path against the live backend, not by unit tests — the mocks answered locally, so the mismatch was invisible. |
| D-19 | `role` is platform-owned; EMS reads an `emsRole` override | The shared `users` collection carries the **platform's** vocabulary (`z.enum(['admin','user'])`, and it encodes supervisor as `role:'user'` + `isSupervisor:true`). EMS needs five roles. A stored `role:'user'` therefore matched no case in `getCapabilities` and fell through to `NO_ACCESS`: every platform account could sign in and then **403 on every screen, including their own dashboard and attendance mark**. `src/lib/role.ts` now owns role resolution: `emsRole` (EMS-owned, additive) first, then the platform value translated, then `employee` as the floor. Applied at every site that materialises a user (auth middleware ×2, login response, token mint ×2, employee mappers) — the existing `user.role ?? 'employee'` fallbacks never fired because `??` only catches null/undefined, not the string `'user'`. **Role changes now write `emsRole`, never `role`**, so the platform's enum stays satisfiable. Chosen over migrating the data because it fixes future platform signups automatically and leaves platform data untouched; a separate `emsRole` field rather than a fixed table because the platform has no manager/hr concept, so a fixed `user→employee` map would permanently flatten anyone EMS promotes. Verified live: a platform-shaped probe resolves to `employee`, regains `dashboard/employee` and `attendance/mine` (both were 403), still gets 403 on admin surfaces, and a `role:'manager'` PATCH left the stored `role` as `'user'`. |
| D-20 | `/attendance/team` returns roster metadata | The team endpoint returns one record per member but no names, so the roster had to call `GET /employees` for them — which is **admin/hr-only**, while the attendance team view is also open to manager and supervisor. A manager's roster therefore 403'd on its own name lookup. `TeamAttendanceResult` now carries a `members` array (name, email, employeeId, department, resolved EMS role, avatarUrl) built from the team the endpoint already resolved, so every permitted role renders the roster in one request. Flagged by the manager-pages agent after I introduced the `getEmployees()` dependency. Verified live: a manager gets 403 on `/employees` and 200 on `/attendance/team` with correct names and a resolved `employee` role badge. |
| D-21 | EMS drops the `supervisor` role; the timesheet platform keeps it | EMS needed five roles, the platform has two (`admin`/`user`) and encodes supervisor as `role:'user'` + `isSupervisor:true`. Supervisor is **project-scoped** on the platform (supervise projects/timesheets) but **people-scoped** in EMS (supervise direct reports) — different concepts sharing one flag, so EMS now models four roles: `admin`, `hr`, `manager`, `employee`. The removal is safe because supervisor was already unreachable in EMS: `resolveEmsRole` ignores `isSupervisor` (D-19), so a platform supervisor resolved to `employee`, and a live pre-flight check found **0 rows** with `emsRole:'supervisor'` or `role:'supervisor'`. **Critical constraint: `users.isSupervisor` and `users.supervisorId` are platform-owned and platform-read** (`canSuperviseUser`, `getSupervisorUsers`), so EMS stops reading them but must **never write them** — `people.service.ts` had `update.isSupervisor = input.role === 'supervisor'`, which post-removal would silently strip timesheet-platform supervisor rights on every HR edit. That write and the `EmployeeEdit` checkbox that fed it are deleted; the shared `isSupervisor` index is left in place because dropping it is irreversible DDL on shared infrastructure. `isSupervisor` is also dropped from `getCapabilities`' signature, which had accepted a parameter it never read — that lie is what hid the mismatch. Deployed frontend-first: removing it from `people.schema.ts` first would make the old HR form 400. **Open item:** the 10 users whose `supervisorId` points at the platform supervisor have no EMS `managerId`, so they are unowned in EMS until HR assigns one. |
| D-22 | Employee management lives only under `/hr`, opened to admin | The frontend declared **two** Employees routes: `/hr/employees` (built, live data) and `/admin/employees`, which was never implemented and rendered `RoutePlaceholder` with a stale "Arrives in Phase 5" note. Admins landed on the dead one, and the working one was gated `['hr']` — so with no `hr` user in the database the whole employee section was unreachable by anyone. Rather than duplicate the pages, `/hr` now accepts `admin` alongside `hr`, the admin nav points at `/hr/employees`, and `/admin/employees[/:id]` forwards via `AdminEmployeesRedirect` (which substitutes the `:id`) so existing bookmarks keep working. This matches the backend, which was already `requireRole('admin','hr')` on every people/leave/onboarding route. Verified live: an admin gets 200 on all 14 endpoints those pages call, including `POST /reports/query` (the EmployeeDetail Attendance tab) and `PATCH /employees/:id`; the probe's `PATCH` left platform-owned `isSupervisor`/`supervisorId` byte-identical. |
| D-23 | `GET /roles` serves the enforced matrix; Roles & Access is read-only | The admin "Roles & Access" screen was a Phase 7 placeholder, but every rule it needs already existed in `getCapabilities` — only an endpoint was missing. Added `ROLE_CATALOG` and `CAPABILITY_CATALOG` (labels, groups, summaries, billable-gating flags) **inside `capabilities.ts`** and a read-only `GET /roles`, so the response is *derived* from `getCapabilities` via `capabilityMatrix()` rather than restating it: the screen cannot drift from what the API enforces, which is the same reasoning as D-19's role resolution. Headcounts group the stored `(role, emsRole)` pairs and run each through the real `resolveEmsRole` rather than approximating with `$ifNull` in the pipeline, so counts honour the EMS override exactly as authorization does. The endpoint is deliberately read-only — roles are assigned per person via `PATCH /employees/:id`; the page links there instead of offering editing. `openTimesheetPlatform` is flagged `billableGated` so the UI can say access depends on the billable flag, not the role alone. Five tests cover the catalog, capability coverage (18 rows / 18 unique keys, every row keyed by all four roles), the enforced values including the `ATTENDANCE_EXEMPT` split (admin may **view** own attendance but not **mark** it), a 403 for `hr` and a 401 anonymous. Note `/admin/audit` and `/me/profile` remain Phase 7 placeholders. |
| D-22 | Employee management served under both `/hr/employees` and `/admin/employees` | The frontend declared **two** Employees routes: `/hr/employees` (built, live data) and `/admin/employees`, which was never implemented and rendered `RoutePlaceholder` with a stale "Arrives in Phase 5" note. Admins landed on the dead one, and the working one was gated `['hr']` — so with no `hr` user in the database the whole employee section was unreachable by anyone. The pages are implemented once in `src/pages/hr` and mounted under **both** namespaces (plus `/:id` and `/:id/edit`), so an admin's URLs stay `/admin/*` like every other admin page while HR keeps `/hr/*` — same components, no duplicated logic. `/hr` still accepts `admin` alongside `hr`, matching the backend, which is already `requireRole('admin','hr')` on every people/leave/onboarding route. Because the pages had `/hr/employees` hardcoded, a new `useEmployeeBase()` hook derives the base from the current pathname so drill-down links (directory → detail → edit → back) stay in whichever namespace the viewer is in; without it an admin would land on `/admin/employees` and be bounced to `/hr/employees/:id` on the first click. Links to sections that exist only under `/hr` (onboarding, leave, documents) intentionally still point there. Verified live: an admin gets 200 on all 14 endpoints these pages call, including `POST /reports/query` (the EmployeeDetail Attendance tab) and `PATCH /employees/:id`; the probe's `PATCH` left platform-owned `isSupervisor`/`supervisorId` byte-identical. |
| D-24 | The Vercel adapter owns startup, mirroring `server.ts` | `server.ts` ensured indexes and seeded leave types at boot, but it never runs under Vercel — `api/index.ts` is the entry point. `ensureIndexes()` was therefore never invoked, and it is the only thing creating the unique indexes (`users.email`, `users.employeeId`, and the `timesheets`/`dailyTimesheets` compound keys). No application-layer code re-checks those constraints, so a deploy against a fresh database would accept duplicate rows *silently*. The adapter now calls it, memoized on `globalThis` and awaited before dispatch so a request cannot race the first index build, and non-fatal (as in `server.ts`) so a briefly unreachable database does not stop the function serving. `validateEnv()` runs at module load instead, which fails fast and loudly on a misconfigured deploy rather than surfacing as a 500 on the first real request. `seedLeaveTypes()` was deliberately **not** moved: `getLeaveTypes()` already falls back to the canonical list, so it is self-healing. |
| D-25 | The session-cleanup cron is removed, not implemented | `vercel.json` declared a nightly job at `/api/v1/internal/cron/session-cleanup`, but no `/api/v1/internal` mount exists — it would have 404ed every night, silently, since Vercel does not fail a deploy over a failing cron. Implementing it would have been the wrong fix anyway: `sessions` already carries a TTL index (`collections.ts`, `expiresAt` + `expireAfterSeconds: 0`), so MongoDB reaps expired documents on its own and the job had nothing left to do. Deleted the `crons` block and dropped `CRON_SECRET` from `validateEnv`, where it was required but read by no code. |
| D-26 | `COOKIE_SAME_SITE` decides the refresh-cookie topology | The refresh cookie *is* the session, so its `SameSite` attribute decides whether users stay logged in. It was hardcoded `lax`, which is correct only when the SPA and API share a site. Critically, `vercel.app` is on the Public Suffix List (verified with `psl`), so every `<name>.vercel.app` is its own registrable domain and its own cookie site: the frontend at `alphanet-navy.vercel.app` and an API on any *other* `*.vercel.app` host are cross-site, and `lax` makes the browser withhold the cookie from `fetch` — login appears to work, then every later request is logged out. Now configurable, defaulting to `lax`, with `none` forcing `Secure` because browsers drop a `SameSite=None` cookie that is not also Secure. `clearCookie` derives its attributes from the same helper as `cookie` (clearing with mismatched attributes is a silent no-op). The existing `csrf.ts` origin guard is what makes `none` safe. |
| D-27 | `CORS_ORIGINS` is fatal in production only | It defaulted to `http://localhost:5173` and was absent from `validateEnv`, so a deploy that forgot it rejected every real browser request while still answering curl and health checks — an outage with nothing in the logs to explain it. Required when `NODE_ENV=production`, left optional in dev where the localhost default is genuinely what you want. |
| D-28 | Rate-limit counters move to Redis when configured, with a loud warning otherwise | `express-rate-limit`'s MemoryStore keeps counters in process memory, which is wrong the moment there is more than one instance: N instances grant N times the intended rate, so the auth limiters silently stop being a brute-force control. `getRateLimitStore()` returns a Redis-backed store per limiter when `REDIS_URL` is set — with a distinct key prefix each, so an email-keyed counter cannot collide with an IP-keyed one — and otherwise returns `undefined` so the library keeps its own default, while logging one warning naming the missing variable rather than staying quiet about a weakened control. |
| D-29 | Pool sizing is env-driven and smaller on Vercel | `maxPoolSize: 10` / `minPoolSize: 1` were per-*process* values that quietly became per-*instance* on a serverless platform, so N instances multiplied them against one shared Atlas limit. Now resolved through `poolSize()`, defaulting to 5/0 when `VERCEL` is set and 10/1 locally; a 0 minimum lets the backing cluster scale to zero between bursts instead of pinning a connection per idle instance. |
| D-30 | `vercel.json` moves off the legacy `builds`/`routes` schema | The old config rewrote only `/api/(.*)`, so the root-level `/health` endpoint (`app.ts`) was unreachable and returned the platform's 404. Replaced with a single catch-all `rewrites` entry, which serves `/health` and all `/api/v1/*` while still letting the filesystem win for any static file. Dropping `builds` also lets Vercel use its own builder and zero-config detection instead of pinning `@vercel/node` by hand. |
| D-31 | The `express-rate-limit` ambient stub is deleted | `src/types/ambient.d.ts` declared `declare module 'express-rate-limit' { const rateLimit: any }`, which shadowed the package's real types entirely: every named export became invisible and the whole limiter configuration — `windowMs`, `max`, `keyGenerator`, `store` — was typechecked as `any`. The stub is unnecessary (v7 ships its own types) and removing it is what allowed the new `store` wiring to be verified at all. The same file stubs `pino`, `pino-http`, `bcryptjs`, `helmet` and `jose` the same way; those are left alone as out of scope, but they are hiding the same class of error. |

---

## Appendix A — Envelope + error-code reference

Success: resource fetches return the 4.2 object verbatim (no extra data wrap). Lists: { key, total[, page, limit] }. Creates: 201 + object. Deletes: 204 empty.

Error: { error: { code, message, details? } } + X-Request-Id.

| HTTP | code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | zod failure (details: field to msg) |
| 400 | BILLABLE_WITHOUT_RATE / PAYRATE_REQUIRED | billable without payRate>0 + currency |
| 400 | LAST_ADMIN | deactivating/demoting last active admin |
| 400 | INVITE_INVALID | bad/expired/used invite or reset token |
| 400 | INVALID_RANGE | leave range contains no working days (weekend-only) |
| 401 | UNAUTHORIZED | missing/expired access; replayed refresh |
| 403 | FORBIDDEN | capability/role/scope denial |
| 403 | ATTENDANCE_EXEMPT | admin calling POST /attendance/mark |
| 404 | NOT_FOUND | unknown id/route |
| 400 | UNSUPPORTED_FILE_TYPE | POST /documents MIME outside the §7.5 allowlist |
| 409 | CONFLICT | sowNumber/email/employeeId/clientId collision |
| 409 | ASSIGNMENT_OVERLAP | overlapping active assignment for user |
| 409 | LEAVE_OVERLAP | overlapping pending/approved leave for the same user |
| 409 | ALREADY_REVIEWED | PATCH /leave/:id on a request no longer pending |
| 429 | RATE_LIMITED | + Retry-After seconds |
| 500 | INTERNAL | never leaks stack in production |


---

## Appendix B — Route to controller to role matrix

| Method + Path | Controller | admin | hr | mgr | sup | emp |
|---|---|---|---|---|---|---|
| POST /auth/* public | auth.* | yes | yes | yes | yes | yes |
| GET /auth/me, POST /auth/logout | auth.* | yes | yes | yes | yes | yes |
| POST /attendance/mark, GET/DELETE /attendance/mine | attendance.* | - | yes | yes | yes | yes self |
| GET /attendance/team, /team/historic | attendance.* | yes | yes | yes | yes team | - |
| GET /dashboard/admin | dashboard.admin | yes | - | - | - | - |
| GET /dashboard/hr | dashboard.hr | yes | yes | - | - | - |
| GET /dashboard/manager | dashboard.manager | yes | - | yes | - | - |
| GET /dashboard/employee | dashboard.employee | yes | yes | yes | yes | yes |
| GET /onboarding/pipeline, POST /onboarding | onboarding.* | yes | yes | - | - | - |
| GET /employees, POST /employees | employee.* | yes | yes | yes ro | - | - |
| GET/PATCH /employees/:id | employee.* | yes | yes | yes ro | - | yes self |
| GET /departments, POST /departments | employee.* | yes | yes | - | - | get only |
| GET /payrate/history | employee.* | yes | yes | - | - | - |
| GET /leave/types, GET/POST /leave | leave.* | yes | yes | yes | yes | yes |
| PATCH /leave/:id | leave.* | yes | yes | - | - | - |
| GET /documents | document.* | yes | yes | yes self | yes self | yes self |
| POST /documents | document.* | yes | yes | yes self | yes self | yes self |
| GET/POST /clients, GET /clients/:id | client.* | yes | - | yes | - | - |
| GET/POST /projects, GET /projects/:id | project.* | yes | - | yes | - | - |
| GET/POST/DELETE /assignments, GET /assignments/demand | assignment.* | yes | - | yes | yes ro | - |
| GET /payroll, export, POST /payroll/close | payroll.* | yes | yes ro | - | - | - |
| POST /reports/query, export | report.* | yes | yes | yes | yes team | - |
| GET /reports/employee-stats | report.* | yes | yes | yes | yes | yes self |
| GET /notifications, PATCH read, POST mark-all-read | notification.* | yes | yes | yes | yes | yes self |
| GET/PUT /settings/org | settings.* | yes | subset | - | - | - |
| GET/PUT /settings/me | settings.* | yes | yes | yes | yes | yes |
| GET /audit | audit.* | yes | - | - | - | - |
---

## Appendix C — Collection + index inventory

| Collection | Indexes |
|---|---|
| users | email!, employeeId!, status, department, role (supervisorId stays platform-owned — D-21) NEW |
| invites | tokenHash!, email, expiresAt swept |
| sessions | refreshHash!, userId, expiresAt TTL |
| clients | clientId!, status |
| projects | sowNumber!, clientId, status |
| assignments | (userId,projectId,status), projectId, userId |
| attendance NEW | (userId,date)!, date, (status,date) |
| leave_requests NEW | (userId,status), status |
| leave_types NEW | value! |
| onboarding_candidates NEW | stage, email |
| payrate_history NEW | (userId,createdAt-1) |
| departments NEW | name! |
| client_contacts NEW | clientId |
| client_activity NEW | (clientId,timestamp-1) |
| documents | userId, kind extended |
| notifications | (userId,read,createdAt-1) |
| activities | createdAt-1, (entityType,entityId) |
| idempotency_keys NEW | key!, expiresAt TTL |
| dashboard_snapshots NEW | (key,expiresAt) app-TTL 5 min |

! = unique.

---

## Appendix D — Decisions log

| Date | ID | Decision | Rationale |
|---|---|---|---|
| 2026-10-02 | D-0 | Spec created from EMSFrontend.md + backend/ inventory; EMSBackend/ folder initialized | Backend plan mirroring the frontend tracker |
| 2026-10-02 | D-1 | Phase 0 scaffold ported from backend/: package.json (minus AI-specific deps), tsconfig strict NodeNext, eslint.config.mjs, vitest.config.ts, vercel.json, .env.example, .gitignore, README.md | Mirror sibling so the two services feel like one product family (§2 rule 2) |
| 2026-10-02 | D-2 | env.ts adapted: validateEnv requires only MONGODB_URI/MONGODB_DB_NAME/JWT_SECRET/CRON_SECRET (no AI key); uses CORS_ORIGINS instead of FRONTEND_URL | EMS has no AI module; CORS_ORIGINS per §3 env spec |
| 2026-10-02 | D-3 | jwt.ts adapted: 15-min access (JWT_ACCESS_TTL) + 30-day refresh (JWT_REFRESH_TTL) per §4.3, replacing platform's 1h/7d | EMS auth model requires shorter-lived access tokens |
| 2026-10-02 | D-4 | collections.ts: ensureIndexes() ported additive-only + EMS-new collections (attendance, leave_requests, leave_types, onboarding_candidates, payrate_history, departments, client_contacts, client_activity, idempotency_keys, dashboard_snapshots) with their indexes per §5.2/Appendix C | Additive-only rule (§1 rule 1): no existing index modified or dropped |
| 2026-10-02 | D-5 | 4.2 envelope table diffed against EMSFrontend/src/services/* (authService, hrService, commercialService, financeService, notificationService, attendanceService, dashboardService) — all envelopes match; no doc corrections needed | Freeze complete for Phase 0 |
| 2026-10-02 | D-6 | Phase 0 gate verified: npm run dev boots :8787, GET /health -> {status:'ok'}, 0 typecheck errors, 0 lint errors (17 no-explicit-any warnings matching platform pattern) | All Phase 0 gates green |
| 2026-10-02 | D-7 | Phase 2 attendance implemented: types/attendance.ts, schemas/attendance.schema.ts, services/attendance.service.ts (mark upsert with findOneAndUpdate, getMyAttendance with streak, getMyAttendanceRange, deleteMyAttendance, getTeamAttendance with KPI derivation, getTeamHistoric), routes/attendance.ts (POST /mark, GET /mine, DELETE /mine, GET /team, GET /team/historic), 20 tests. Admin exempt via ATTENDANCE_EXEMPT 403. Team scoping: admin/hr see all non-admin users; manager/supervisor see direct reports via managerId/supervisorId. Streak skips weekends. 0 typecheck errors, 0 lint errors, 50/50 tests pass (30 auth + 20 attendance). | Gates met: overwrite-not-duplicate, admin-exempt, KPI math, team scoping verified
| 2026-10-02 | D-8 | Phase 3 dashboards implemented: types/dashboard.ts (5 role types + shared), lib/dashboard/aggregators.ts (admin, hr, manager, supervisor, employee aggregators + 5-min snapshot cache), routes/dashboard.ts (GET /dashboard/:role with role-based auth middleware), 22 tests. Authz: admin→all, hr→admin+hr, manager→admin+manager, supervisor→admin+supervisor, employee→any-authenticated. Zero-writes (read-only from platform DB). 0 typecheck errors, 0 lint errors, 72/72 tests pass. | Gates met: shape parity vs EMSFrontend types, 403 cross-role, empty-org zeroed defaults
| 2026-10-04 | D-9 | Phase 5 leave + documents implemented: types/leave.ts, types/document.ts, schemas/leave.schema.ts, schemas/document.schema.ts, services/leave.service.ts (countLeaveDays weekday math, seeded leave types, self/reviewer list scoping, overlap guard, review + requester notify), services/document.service.ts (toEmsDocument mapper, self/reviewer list scoping, metadata-first create), routes/leave.ts, routes/documents.ts (multer diskStorage, 10 MB transport limit, MIME allowlist), 50 tests. Mounted at /api/v1/leave and /api/v1/documents. Document bytes intentionally NOT persisted - the row is the metadata source of truth and `storageKey` is reserved for the platform blob store (R-5); wiring that store is Phase 8. `uploadedBy` persisted as ObjectId to match the shared collection. 0 typecheck errors, 0 lint errors, 140/140 tests pass. | Gates met: request->approve->notify, expiry/calendar widget data, mock-parity shapes |
| 2026-10-04 | D-10 | S5.2 `leave_types` seed corrected from sick/casual/earned/unpaid to the 6 frontend `LeaveType` values (vacation, sick, personal, unpaid, maternity, paternity) | Non-negotiable rule 3: the frontend contract wins for shape. The original 4-value list would have 400'd requests the EMSFrontend leave form can submit, since its `type` select is fed by `GET /leave/types` but its TS union is fixed. |
| 2026-10-04 | D-11 | `attendance.service.ts markAttendance` read `result?.value` from `findOneAndUpdate`; `mongodb@6` returns the document directly, so every `POST /attendance/mark` answered 500. Fixed to the v6 contract; the 3 attendance test mocks were reproducing the v5 `{ value }` wrapper and corrected so the drift cannot recur. 20/20 attendance tests pass. | Found by the 8.3 edge sweep (all 5 concurrent marks 500'd). A unit suite that mocks the driver cannot detect a driver-contract change — only a live run can. |
| 2026-10-04 | D-12 | `sessions.refreshHash` unique index is now partial (`{ refreshHash: { $type: 'string' } }`), with a drop-if-not-partial migration in `ensureIndexes`. | `sessions` is shared. The platform's documents omit `refreshHash`, and a plain unique index reads a missing field as `null`, so the platform's second login always hit E11000 — first login OK, every later one 401. Proven live: login #1 200, login #2 401 with a duplicate-key message. |
| 2026-10-04 | D-13 | `toEmsUser` (people.service.ts) routes `createdAt`/`updatedAt`/`joinedAt` through new `toDate`/`toDay`/`toIso` helpers that accept a `Date`, an ISO string, or nothing. | `users` is a shared collection. One row with a string `createdAt` 500'd the entire employee directory; `joinedAt` had the same latent flaw (`new Date(x).toISOString()` on an invalid date still throws). Verified live: seeded timestamps were being written as ISO strings, and `GET /employees` returned `createdAt?.toISOString is not a function`. |
| 2026-10-04 | D-14 | `seed-demo --reset` now deletes by `seedTag: 'seed:demo'` across every seeded collection instead of by natural key. | The old reset deleted only users/clients/projects/candidates, stranding their children; the next run's upserts matched freshly minted `_id`s and silently doubled every dependent collection (timesheets 8→16, leave_requests 4→8, assignments 3→6, …). Tag-scoped deletion is order-independent and cannot touch a row the script did not create. `leave_types`/`settings` stay untagged — they are org-wide config owned by `seedLeaveTypes()`. |
| 2026-10-04 | D-15 | `EMSBackend/.env` repointed to the platform's Atlas cluster with `MONGODB_DB_NAME=alphanet`, and `JWT_SECRET` aligned with the platform. Verified: both services boot on `alphanet`, both allow repeated logins, and tokens authenticate cross-service in both directions. Temporary probe user + its 5 sessions removed; `alphanet` back to 12 users / 4 clients / 4 projects / 45 timesheets / 2 invites. | `.env.example` already specified Atlas `alphanet`, so the local `.env` was the deviation. Sharing the JWT secret is not optional detail: with different secrets each service reads the same rows but rejects the other's tokens. |
| 2026-10-04 | D-16 | Added `ensurePartialUnique()` in `collections.ts`; `sessions.refreshHash`, `clients.clientCode` and `invites.tokenHash` now use it. 4 new regression tests (290 total). | `ensureIndexes` threw on real `alphanet` data — twice. Index-build E11000 aborts the rest of `ensureIndexes`, so everything declared after the failing index silently stayed unindexed. Audited all 17 unique indexes against live `alphanet` first; these three were the only conflicts. Verified the semantics directly: two `clients` rows without `clientCode` coexist, while a duplicate `clientCode` is still rejected. |
| 2026-10-04 | D-8 | 8.1/8.2/8.3 verified: seed idempotent + mock parity, cross-platform 33/33, edge sweep 29/29. Added `src/tests/phase8-hardening.test.ts` (6 tests). Gate: typecheck clean, lint 0 errors, build clean, **286/286 tests** (was 280). | 8.2 drove both services' own HTTP APIs against one DB. It is what surfaced D-12 and D-13; 8.3 is what surfaced D-11. Scratch DBs (`eniac_ems_seedtest`, `eniac_ems_edge`, `eniac_ems_e2e_p7`) and both temp verification scripts were removed. |

---

*End of EMSBackend.md. Keep S15 current, keep every S14 phase gate green, and never let S4 envelopes drift from what EMSFrontend/src/services/* unwraps.*
