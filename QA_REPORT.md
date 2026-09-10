# AlphaNet — Complete QA Analysis Report

> **Scope:** Full source review of `backend/` (routes, controllers, services, schemas, middleware, tests, config) and `frontend/` (contexts, services, types, pages, components, utils, config). No code was modified.
>
> **Verification status:** Backend test suite passing (65/65 via `vitest`); frontend builds successfully (866 KB minified bundle, 229 KB gzip). Every finding below was verified against the current source at commit `81d8dd7` on `master`.

---

## Table of Contents

- [🔴 CRITICAL — Broken Features](#-critical--broken-features)
- [🟠 HIGH — Security Vulnerabilities](#-high--security-vulnerabilities)
- [🟡 MEDIUM — Correctness & Data-Integrity Bugs](#-medium--correctness--data-integrity-bugs)
- [🔵 LOW — Quality, UX, Performance, Hygiene](#-low--quality-ux-performance-hygiene)
- [Summary Table](#summary-table)
- [Recommended Fix Priority](#recommended-fix-priority)

---

## 🔴 CRITICAL — Broken features (verified end-to-end)

### C1. The entire Documents feature is broken server-side

**Files:** `backend/src/middleware/access.ts` (lines 63–73), `backend/src/routes/projects.ts` (line 19), `backend/src/routes/documents.ts`

`requireProjectAccess` reads **`req.params.id`**:

```ts
const projectId = req.params.id as string
if (!projectId) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Project ID is required' } })
}
```

But document routes are mounted at `/projects/:projectId/documents` — the param is named **`projectId`**, never `id`. Result: **every document call (list, upload, delete) returns `400 VALIDATION_ERROR: "Project ID is required"`**. The feature cannot work at all in its current wiring.

---

### C2. Creating a user is impossible — password contract mismatch

**Files:** `backend/src/schemas/user.schema.ts` (line 12), `frontend/src/types/user.ts`, `frontend/src/pages/admin/CreateUser.tsx`

Backend `createUserSchema` **requires `password`**:

```ts
password: z.string().min(1, 'Password is required'),
```

The frontend `CreateUserInput` type has **no password field**, and the `CreateUser` form never collects one. Every "Create User" submit fails with `400 VALIDATION_ERROR: Password is required`. There is also no UI or API for setting/rotating passwords later.

---

### C3. Infinite notification fetch loop (will melt production)

**Files:** `frontend/src/contexts/NotificationContext.tsx` (lines 21–27), `frontend/src/contexts/AppDataContext.tsx`

`NotificationContext` runs:

```ts
useEffect(() => {
  if (user) {
    refreshNotifications().then(() => { setNotifications(appNotifications) })
  }
}, [user, appNotifications, refreshNotifications])
```

`refreshNotifications()` updates `appNotifications` state in `AppDataContext` → provider re-renders → `refreshNotifications` is recreated (not memoized) → effect re-triggers → fetch again → **infinite `GET /notifications` loop**.

With the production rate limit of **120 req/min** (`backend/src/app.ts`), this exhausts the entire API budget within seconds of login and 429s the whole app.

> **✅ STATUS: FIXED** (frontend only, no API changes). `NotificationContext` no longer holds state or runs effects — it is now a memoized projection of `AppData` notifications. `AppDataProvider` fetches notifications once in its initial login load (`fetchNotifications().catch(() => [])` — isolated failure so a notifications outage cannot break the rest of the boot load), and `refreshNotifications` / `markNotificationAsRead` / `markAllNotificationsAsRead` are now `useCallback`-stabilized. The exported context shape (`notifications, unreadCount, markAsRead, markAllAsRead, refresh`) is unchanged, so `Topbar.tsx` and all other consumers required no changes. Verified with `tsc -b && vite build` (passing) and `oxlint` (0 errors). This also resolves finding D11 (stale notification data).

---

### C4. Project document uploads are silently discarded on Create Project

**File:** `frontend/src/pages/admin/CreateProject.tsx` (lines 43–62, 84–99)

`addFiles()` collects files into local state purely for display. On submit, only the project JSON is sent — `documents` state is never transmitted. Files never reach the backend. Combined with C1, document management is non-functional on both ends.

---

### C5. Demo logins cannot work — seed/credential mismatch

**Files:** `backend/src/scripts/seed-demo-users.ts` (lines 7–9), `frontend/src/services/authService.ts` (lines 16–24)

| Role | Seed script | Frontend demo button |
|---|---|---|
| Admin | `nikhil@eniac.demo` | `nikhil@alphanet.demo` |
| User | `alex@eniac.demo` | `alex@alphanet.demo` |
| Supervisor | `raj@eniac.demo` | `raj@alphanet.demo` |

All three demo login buttons fail against a seeded database.

---

### C6. No token refresh — users are force-logged-out every hour

**Files:** `backend/src/services/auth.service.ts` (line 99), `backend/src/routes/auth.ts`, `frontend/src/services/apiClient.ts` (lines 65–79)

`refreshUserSession` exists in the auth service but **no route/controller exposes it**, and the client never calls it. Access tokens expire in 1h. `apiClient.ts` handles 401 on GETs by waiting 200 ms and **retrying the identical request with the same expired token**, then clears the token and throws — guaranteed logout mid-session with no recovery path.

---

### C7. `npm start` is broken (backend)

**Files:** `backend/tsconfig.json` (`rootDir: "."`), `backend/package.json` (start script)

`tsc` emits `dist/src/server.js` (because `rootDir` is `"."`, not `"./src"`), but the start script runs:

```json
"start": "node dist/server.js"
```

→ `MODULE_NOT_FOUND`. Self-hosted/Docker production start fails (Vercel serverless path is unaffected).

---

### C8. Reports date-range presets are no-ops

**Files:** `frontend/src/pages/admin/Reports.tsx` (lines 34–44), `frontend/src/types/report.ts`, `backend/src/services/report.service.ts`

`Reports.tsx` sends `startDate/endDate` **only** when `dateRange === 'custom'`. The backend has no `dateRange` param. Selecting "Last 7/30/90 days" returns **all-time data** presented as filtered — silently wrong analytics.

---

## 🟠 HIGH — Security vulnerabilities

### S1. IDOR: mark any notification as read

**Files:** `backend/src/controllers/notification.controller.ts` (lines 16–22), `backend/src/services/notification.service.ts` (lines 63–67)

`POST /notifications/:id/read` → `markNotificationAsRead(id)` has **no `userId` constraint**:

```ts
const result = await db.collection(COLLECTIONS.NOTIFICATIONS).updateOne({ _id: new ObjectId(id) }, { $set: { read: true } })
```

Any authenticated user who learns/guesses an ID can mutate another user's notifications.

---

### S2. Any user can forge notifications for any user

**File:** `backend/src/controllers/notification.controller.ts` (lines 29–47)

`POST /notifications` accepts caller-supplied `userId` with no authorization. The frontend actively exploits this (see D1), proving the hole is live.

---

### S3. Any user can forge activities attributed to anyone

**File:** `backend/src/controllers/activity.controller.ts` (lines 35–47)

`POST /activities` accepts caller-supplied `userId`/`projectId`. Also, invalid ObjectId input throws raw Mongo errors → 500 with internal message.

---

### S4. Activity feeds readable without access control

**File:** `backend/src/controllers/activity.controller.ts` (lines 25–33)

`GET /activities/projects/:projectId` and `GET /activities/timesheets/:timesheetId` have **no ownership/project-access checks**. Any authenticated user can enumerate activity for any resource ID.

---

### S5. Secret fallbacks defeat env validation

**Files:** `backend/src/lib/jwt.ts` (line 3), `backend/src/controllers/notification.controller.ts` (line 50), `backend/src/lib/env.ts`

```ts
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me-in-production')
// ...
const cronSecret = process.env.CRON_SECRET || 'change-me-in-production'
```

A missing prod secret silently degrades to a publicly-known value. `validateEnv()` exists but only runs lazily inside `getMongoClient()`.

---

### S6. Public document blobs + no delete policy

**Files:** `backend/src/controllers/document.controller.ts` (line 37), `backend/src/controllers/document.controller.ts` (lines 73–79)

Uploads go to Vercel Blob with `access: 'public'` — anyone with the URL can fetch the file. `removeDocument` requires only project access: any team member can delete anyone's documents, with no uploader/admin policy.

---

### S7. Supervisor edit path unreachable on projects

**File:** `backend/src/routes/projects.ts` (lines 14–18)

```ts
router.patch('/:id', requireAdmin, requireProjectEdit, update)
router.delete('/:id', requireAdmin, requireProjectEdit, remove)
```

`requireAdmin` runs first, so `canEditProject`'s supervisor branch (`middleware/access.ts`) can never execute. Dead authorization logic; supervisors can't edit despite the model intending it.

---

### S8. User directory fully exposed to all users

**Files:** `backend/src/routes/users.ts` (line 9), `backend/src/routes/supervisors.ts`, `frontend/src/components/layout/Topbar.tsx` (lines 119–128)

`GET /users` (names, emails, employee IDs, departments) requires only authentication — any employee can enumerate the whole org, and the Topbar search surfaces it. `GET /supervisors/:id/users` likewise lets anyone enumerate any supervisor's team. A security test (`backend/src/tests/security.test.ts` line 72) codifies this as intended — flagged as a privacy decision to revisit.

---

### S9. Admin self-lockout / last-admin problems

**File:** `backend/src/controllers/user.controller.ts`

No guard prevents an admin from deactivating their own account, demoting themselves, or removing the last admin. `deactivate`/`activate` are admin-only with zero self-protection.

---

### S10. Access token in localStorage

**File:** `frontend/src/services/apiClient.ts` (lines 4–10), `frontend/src/services/authService.ts`

XSS would grant full account access. (Refresh token is correctly HttpOnly, but the access token — the one actually used — lives in `localStorage`.)

---

### S11. Error message leakage

**Files:** `backend/src/controllers/notification.controller.ts`, `activity.controller.ts`, `report.controller.ts`, `document.controller.ts`, `timesheet.controller.ts`

Multiple 500 handlers return raw `err.message`, leaking internals (Mongo driver messages, etc.):

```ts
res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } })
```

---

## 🟡 MEDIUM — Correctness & data-integrity bugs

### D1. Duplicate notifications & activities with wrong attribution

**Files:** `backend/src/services/approval.service.ts`, `backend/src/services/timesheet.service.ts`, `frontend/src/components/approvals/ReviewPanel.tsx` (lines 72–132), `frontend/src/pages/user/TimesheetEditor.tsx` (lines 202–270)

The backend already creates notifications + activities on approve/decline/submit/withdraw. The frontend **also** calls `addNotification` + `addActivity` after those calls succeed → users receive **double notifications**, and activity logs contain entries like "*employee* approved a timesheet" (naming the wrong actor — `ReviewPanel` uses `employee?.name` instead of the reviewer's name) plus "*user* submitted…" twice. This works only because of security hole S2.

---

### D2. Supervisor approval queue includes the supervisor's own timesheets

**File:** `backend/src/services/approval.service.ts` (line 46)

```ts
{ userId: { $in: [...supervisedUserIds, reviewerId.toString()].map((id) => new ObjectId(id)) } }
```

A supervisor sees **their own pending timesheets** in their review queue.

---

### D3. Week navigation is broken in TimesheetEditor

**File:** `frontend/src/pages/user/TimesheetEditor.tsx` (lines 94–114)

`canNavigatePrev` and `canNavigateNext` are **identical expressions**:

```ts
return new Date(weekStart) < currentWeekStart  // both functions
```

From the current week, both are disabled — **you can never navigate to previous weeks**, the primary use case for corrections.

---

### D4. Frontend/backend overtime math disagrees

**Files:** `frontend/src/pages/user/TimesheetEditor.tsx` (lines 158–168), `backend/src/services/timesheet.service.ts` (lines 115–126)

Frontend `totals` adds **all** Sat+Sun hours to overtime regardless of `entryType`; backend `calcTotals` counts weekend hours only from `entryType: 'overtime'` entries. UI preview ≠ saved totals.

---

### D5. Inconsistent draft rules (0-hour drafts are a trap)

**File:** `backend/src/services/timesheet.service.ts`

`createTimesheet` allows a 0-hour draft, but `updateTimesheet` rejects any save with `totalHours <= 0` ("At least one hour is required before submission"). You can create a draft you can never save.

---

### D6. PATCH timesheet edge cases

**File:** `backend/src/controllers/timesheet.controller.ts`, `backend/src/services/timesheet.service.ts`

- `updateTimesheetSchema` accepts `projectId` but the service **ignores it** (silent no-op; also skips re-checking team membership for a new project).
- Omitted `weekStart` → `normalizeToMonday('')` → `Invalid Date` → `toISOString()` throws `RangeError` → user gets cryptic `400 "Invalid time value"`.
- Changing `weekStart` can collide with the unique `(userId, projectId, weekStart)` index → raw Mongo duplicate-key error surfaced to the user.

---

### D7. Timesheet entries are completely unvalidated at the schema level

**File:** `backend/src/schemas/timesheet.schema.ts` (lines 3–8)

```ts
entries: z.array(z.any()),
```

All entry validation depends on the service — schema validation theater for the most business-critical payload.

---

### D8. Project deletion doesn't cascade

**File:** `backend/src/services/project.service.ts` (lines 156–160)

`deleteProject` removes only the project row. Orphaned timesheets, documents (blobs stay in storage!), notifications, activities, and stale `supervisorId`/`teamMemberIds` references remain, producing "Unknown" rows and broken flows.

---

### D9. `review.reviewedAt` type is inconsistent

**Files:** `backend/src/services/timesheet.service.ts` (line 338), `backend/src/services/approval.service.ts` (line 103)

`timesheet.service.ts` stores an ISO **string** (withdraw); `approval.service.ts` stores a **Date** (approve/decline). Consumers can't rely on the shape.

---

### D10. Notification type union drift

**Files:** `backend/src/controllers/document.controller.ts` (line 60), `frontend/src/types/notification.ts` (line 1)

Backend emits `type: 'document'`; the frontend `NotificationType` union omits it → falls into the `else` navigation branch (goes to `/user/submissions`), and TS assumptions diverge.

---

### D11. NotificationContext shows stale data

**File:** `frontend/src/contexts/NotificationContext.tsx` (lines 21–27)

`refreshNotifications().then(() => setNotifications(appNotifications))` captures the **pre-refresh** `appNotifications` value — the rendered list always lags one refresh behind.

---

### D12. Approval/decline failures are silent

**File:** `frontend/src/components/approvals/ReviewPanel.tsx` (lines 72–132)

`handleApprove`/`handleDecline` use `try { … } finally` with **no catch** → server rejections become unhandled promise rejections; no error toast, UI stuck on "processing" then silently resets.

---

### D13. Zod `notification.schema.ts` is dead code

**Files:** `backend/src/schemas/notification.schema.ts`, `backend/src/controllers/notification.controller.ts`

`listNotificationsQuery` (read/page/limit filters) is defined but never used; the controller ignores all query params — so the client's `/notifications?unread=true` silently returns everything (`notificationService.getUnreadNotifications`).

---

### D14. Search/filter endpoints that silently ignore their parameters

**Files:** `frontend/src/services/timesheetService.ts`, `userService.ts`, `projectService.ts`, `notificationService.ts` vs. corresponding backend controllers

| Frontend call | Backend behavior |
|---|---|
| `getTimesheetsByUserId(userId)` → `?userId=` | `userId` query ignored |
| `getTimesheetsBySupervisorId(supervisorId)` → `?supervisorId=` | ignored |
| `getCurrentWeekTimesheet(...)` → `?weekStart=` | ignored |
| `searchUsers(q)` → `?q=` | ignored (returns unfiltered list) |
| `searchProjects(q)` → `?q=` | ignored |
| `listUsers` role/status filters | never passed even though service supports them |

Callers get **unscoped data presented as filtered** — several of these are live in pages.

---

### D15. Session lifecycle gaps

**File:** `backend/src/services/auth.service.ts`

Login never prunes prior sessions (unbounded accumulation); deactivation/password change doesn't revoke sessions or live access tokens beyond the per-request `status: 'active'` check (which does block authenticated calls — but refresh cookies persist).

---

### D16. Password policy inconsistency

**Files:** `backend/src/services/auth.service.ts` (lines 11–24), `backend/src/schemas/auth.schema.ts` (line 14)

Service enforces 8+ chars/upper/lower/digit; `resetPasswordSchema` accepts **min 6**. Two different policies for the same credential.

---

### D17. CSV export is injection/malformation-prone

**Files:** `frontend/src/services/reportService.ts` (lines 42–66), `frontend/src/pages/admin/Users.tsx`, `frontend/src/pages/admin/Supervisors.tsx`

`exportToCSV` quotes only when a comma is present — values containing quotes, newlines, or leading `=`/`+`/`-` (CSV formula injection) are not handled.

---

## 🔵 LOW — Quality, UX, performance, hygiene

### UX/UI

| # | Issue | File(s) |
|---|---|---|
| L1 | Root `/` and 404 wildcard redirect to `/adminlog` — employees land on the *admin* login page | `frontend/src/App.tsx` (lines 38, 99) |
| L2 | Logout always navigates to `/adminlog`, even for regular users | `Sidebar.tsx` (line 73), `Topbar.tsx` (line 141) |
| L3 | "Forgot password?" is a dead button (backend endpoints are 501 stubs). "Remember me" does nothing | `UserLogin.tsx` (lines 126–139), `backend/src/controllers/auth.controller.ts` (lines 52–58) |
| L4 | Dashboard says "Good morning" regardless of time; "Hours This Week" card actually sums **all** timesheets ever; DeadlineCard "progress" is a fake formula (`100 − daysRemaining×2`) | `pages/admin/Dashboard.tsx` (lines 70, 235–258, 280) |
| L5 | Admin Settings (timezone, workdays, weekly hours, weekend-overtime toggle) persist to **localStorage only** with a fake 400 ms delay — no backend entity exists, and none of it influences backend validation (Mon–Fri/40h are hardcoded) | `pages/admin/Settings.tsx`, `backend/src/services/timesheet.service.ts` |
| L6 | Topbar notification clicks send admins to `/user/*` routes (bounced by ProtectedRoute) | `Topbar.tsx` (lines 280–292) |
| L7 | Toast IDs use `Date.now()` — two toasts in the same millisecond collide and one is lost | `ToastContext.tsx` (line 23) |
| L8 | `handleSubmit` in `TimesheetEditor` duplicates its validation block (dead code) | `TimesheetEditor.tsx` (lines 204–218) |
| L9 | Custom modals/ConfirmDialogs: no focus trap, no Escape handling, no focus restore | `TimesheetEditor.tsx`, `ReviewPanel.tsx` |

### Architecture / performance

| # | Issue | File(s) |
|---|---|---|
| L10 | `authenticate` performs a DB `findOne` on **every** request — meaningful serverless DB load | `backend/src/middleware/auth.ts` (line 28) |
| L11 | `AppDataProvider` eagerly fetches **all** projects, users, timesheets, activities, and documents on login for every role; no pagination anywhere (timesheets, users, activities, notifications). Will not scale | `frontend/src/contexts/AppDataContext.tsx` (lines 68–105) |
| L12 | N+1 query patterns: per-team-member `findOne` loops in `submitTimesheet`/`withdrawTimesheet`; per-project user lookups in `sendDeadlineNotifications` | `backend/src/services/timesheet.service.ts`, `notification.service.ts` |
| L13 | `ensureIndexes()` runs 15+ `createIndex` calls on **every cold start** of every serverless instance | `backend/src/lib/collections.ts`, `server.ts` |
| L14 | Single 866 KB JS chunk (229 KB gz) — no code splitting; Recharts eagerly bundled into the initial load; `zustand` is a declared dependency but **never imported** | `frontend/package.json`, build output |
| L15 | `AuthContext` boot calls `getCurrentUser()` twice (`checkAuth()` internally resolves it, then calls it again) | `frontend/src/contexts/AuthContext.tsx` (lines 21–39) |
| L16 | `flushSync` in login handlers — React antipattern | `AuthContext.tsx` (lines 43–46) |
| L17 | Cron endpoint `/notifications/cron/deadline` exists but **no scheduler is configured** in `vercel.json` — dead feature | `backend/src/routes/notifications.ts` (line 14), `backend/vercel.json` |

### Hygiene / repo

| # | Issue | Location |
|---|---|---|
| L18 | **22 debug artifacts** at `backend/` root (`test-compiled-*.mjs`, `test-jwt-verify.ts`, etc.) plus compiled `api/index.d.ts(.map)`/`index.js.map` committed; dead `routes/test-*.ts`, `routes/users-copy.ts` | `backend/` root, `backend/src/routes/` |
| L19 | Root `package.json` declares multer **2.3.0** while backend pins **1.4.5-lts.1** — version drift trap | `package.json`, `backend/package.json` |
| L20 | `frontend/.env.local` and `.env.production` both point local dev at the **production** API — running `npm run dev` mutates prod data | `frontend/.env.local`, `frontend/.env.production` |
| L21 | Backend has an `eslint` script but **no ESLint config file** → `npm run lint` fails | `backend/package.json` (line 10) |
| L22 | Meaningless git history (`\/` commits); personal résumé PDF and docx/pdfs committed to the repo | git log, repo root |
| L23 | Mixed `@eniac`/`@alphanet` branding and demo credentials shipped in the client bundle | `authService.ts`, `seed-demo-users.ts` |

### Testing

| # | Issue |
|---|---|
| L24 | **Zero frontend tests** (no runner, no test script) |
| L25 | Backend covers only auth/access/security/timesheet; projects, users, notifications, documents, reports, activities have **no tests** — which is exactly where C1, C2, S1–S4 live |
| L26 | Heavy mocking of bcrypt/jwt in auth tests reduces them to wiring checks; one test enshrines the S8 exposure as expected behavior |

### Config details

| # | Issue | File(s) |
|---|---|---|
| L27 | CORS failures throw inside the origin callback → surface as 500 with no CORS headers instead of a clean 403 | `backend/src/app.ts` (lines 22–36) |
| L28 | `trust proxy: 1` is correct for Vercel but rate limiting remains per-IP — shared NATs will hit the 10/min auth limit collectively | `backend/src/app.ts` (lines 44–57) |

---

## Summary Table

| Severity | Count | Highlights |
|---|---|---|
| 🔴 Critical | 8 | Documents API 400s always (C1); user creation impossible (C2); infinite `/notifications` loop (C3); uploads discarded (C4); demo logins broken (C5); no refresh → hourly logout (C6); broken `npm start` (C7); fake report date filters (C8) |
| 🟠 High (security) | 11 | IDOR on notifications; notification/activity forgery; open activity feeds; secret fallbacks; public blobs; unreachable supervisor edits; full user directory exposure; admin self-lockout |
| 🟡 Medium | 17 | Duplicate/wrong-attribution activity records; broken week nav; overtime math mismatch; silent param-ignoring endpoints; no cascade delete; password policy drift; CSV injection |
| 🔵 Low | ~28 | Fake settings, dead buttons, hygiene, perf, missing frontend tests, repo cleanliness |

---

## Recommended Fix Priority

1. **C3** — Infinite notification loop (prod-breaking within seconds of login)
2. **C1 + C4** — Documents feature (param mismatch + discarded uploads)
3. **C2** — User creation (password contract)
4. **C6** — Auth refresh flow (hourly forced logout)
5. **S1–S4** — Authorization holes (IDOR + forgery)
6. **C5** — Demo credential alignment
7. **C7** — `npm start` path fix
8. **C8 + D14** — Filter/param contract alignment
9. **S5–S11** — Remaining security hardening
10. **D1–D17** — Correctness/data-integrity batch
11. **L1–L28** — Quality, perf, hygiene batch

---

*Report generated from static source analysis on 2026-09-10. All findings verified against commit `81d8dd7` on `master`.*