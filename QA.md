# Alpha-net (Eniac) — QA Report

**Scope:** Full sweep of `frontend/` (React 19 + Vite + TS) and `backend/` (Express + MongoDB): auth, RBAC, timesheets, approvals, documents, notifications, activities, reports, settings, and tests.
**Method:** Code review of every route/controller/service/middleware on the backend and every page/context/service/util on the frontend, cross-checked against route wiring and data flow. Backend suite executed locally: **12 files, 125 tests, all passing** — note all tests are unit tests with mocked Mongo/JWT/bcrypt; none of the findings below are covered by tests.
**Date:** 2026-09-11

Severity legend: 🔴 Critical (breaks core functionality or security) · 🟠 High (breaks a feature or misleads users) · 🟡 Medium (incorrect behavior, workaround exists) · ⚪ Low / hygiene.

---

## 🔴 Critical

### C1. Entire initial data load fails for every non-admin user **[FIXED — see checklist]**
- **Where:** `frontend/src/contexts/AppDataContext.tsx:78-86` (initial `Promise.all`), `backend/src/routes/users.ts:9`.
- `loadInitialData()` runs `Promise.all([fetchProjects(), fetchUsers(), fetchTimesheets(), ...])`. `fetchUsers()` hits `GET /users`, guarded by `requireAdmin`. For any `role: 'user'` account (employees **and** supervisors) this returns **403**, so the whole `Promise.all` rejects.
- There is **no `catch`** (only `finally`), so the rejection is unhandled and **all** state (projects, timesheets, activities, documents, notifications) stays `[]` with **no error surfaced**. Every employee/supervisor sees empty dashboards, empty "My Projects", empty team timesheets, `-` names, zero notifications — the app is unusable for the primary persona.
- Only the notifications fetch is isolated (`.catch(() => [])`); users/projects/timesheets/activities are not. The failure is also an **unhandled promise rejection**.

### C2. Documents are never fetched — the documents list is always empty **[FIXED — 2026-09-11]**
- **Where:** `frontend/src/contexts/AppDataContext.tsx:83` calls `fetchDocuments()` with no argument; `frontend/src/services/documentService.ts:4-7` — `getDocuments(projectId?)` **returns `[]` when `projectId` is undefined**.
- The backend endpoint is nested (`GET /projects/:projectId/documents`); no store-compatible "list documents" call exists. Consequence: the `documents` array in `AppDataContext` is always empty on load. Documents uploaded during "Create Project" **disappear from the UI after any reload**, and ProjectDetails (admin + user) permanently shows "No documents have been uploaded for this project."
- Upload works (it appends to local state), so users can upload a file and never see it again — silent data loss from the user's perspective.
- **Fix:** added store-level `listDocuments()` in `documentService.ts` (fetches all accessible-project documents in one authenticated call) and `projectIdsForUser()` (role-based project scope, mirrors supervisor/user directory scoping). `AppDataContext` now calls `listDocuments()` (no arg) and stores the flat `documents[]` — persistence across reloads restored. `addDocument`/`deleteDocument` refresh the store from the server instead of mutating local state. `ProjectDetails` list/table buttons now use the in-store documents. Covered by `documents-store.test.ts` (3 tests: non-admin listing scope, empty case, upload/delete persistence across reload).

### C3. Deadline-reminder cron endpoint can never authenticate **[FIXED — 2026-09-11]** **[FIXED — 2026-09-11]**
- **Where:** `backend/src/routes/notifications.ts:7-13`, `backend/src/controllers/notification.controller.ts:41-49`.
- `notificationsRoutes()` applies `router.use(authenticate)` to **all** routes, including `POST /cron/deadline`. The controller then expects `Authorization: Bearer <CRON_SECRET>`.
- `authenticate` will verify the cron secret as a **JWT access token** and reject it → **401**. A scheduler holding only the `CRON_SECRET` (the designed credential) can never reach the handler; deadline notifications are dead code in production. Fix: mount the cron route before the `authenticate` middleware (it already self-protects with the secret check).

### C4. `GET /activities` leaks the entire org's activity feed and ignores project access control
- **Where:** `backend/src/controllers/activity.controller.ts:14-27`, `backend/src/routes/activities.ts:15`.
- `listActivities` requires only `authenticate`. It returns **all activities for all users**, and honors `?projectId=` **without** calling `canAccessProject` (unlike `getProjectActivities`, which does check).
- Any authenticated employee can enumerate every user's actions across every project (including entries like "X declined a timesheet…") — an IDOR-style exposure. The scoped endpoints (`/activities/users/:id` admin-or-self, `/activities/projects/:id` access-checked) prove the intent; the collection endpoint was left unscoped.
- Also `POST /activities` lets any authenticated user inject arbitrary, unbounded descriptions into the shared feed (spam/log-forging vector).

---

## 🟠 High

### H1. False success toasts and swallowed backend errors in the timesheet editor
- **Where:** `frontend/src/contexts/AppDataContext.tsx:212-270` — `handleSaveDraft`, `handleSubmitTimesheet`, `handleWithdrawTimesheet`, `handleApproveTimesheet`, `handleDeclineTimesheet` all do `catch { return undefined }` (error message destroyed).
- `frontend/src/pages/user/TimesheetEditor.tsx:188-189` — `handleSaveDraft` calls `await saveDraft(...)` then unconditionally shows **"Draft saved"** without checking the `undefined` return → success toast even when the backend rejected the save (day-rule violations, E11000 week collisions).
- `TimesheetEditor.tsx:223-233` — `handleSubmit` ignores the result of `submitTimesheet(...)` → shows **"Timesheet submitted successfully"** and navigates away even on failure. Same for `handleWithdraw` (246-251). Users believe work was saved/submitted; on reload it's gone. This is the most user-hostile failure path in the product.

### H2. Client-side validation misses backend day-of-week rules; hidden hours are submitted
- **Where:** `frontend/src/pages/user/TimesheetEditor.tsx:69-84, 138-140, 330-342`; backend rule `backend/src/services/timesheet.service.ts:84-116`.
- The UI disables day inputs that don't match the entry type (regular → Mon–Fri only; overtime → Sat–Sun only), but `handleEntryTypeChange` **keeps previously typed hours** in state. Type 8h on Saturday, switch the entry to "Regular" → the value is silently retained; local validation passes (it never checks day rules); the save rides the swallowed-error path from H1 and "succeeds" in the UI while the backend rejected it.
- The submit path saves the draft first, so invalid day data can also block submission with a concatenated backend error — after a success toast for the draft.

### H3. Week navigation silently *moves* an existing timesheet to another week
- **Where:** `frontend/src/pages/user/TimesheetEditor.tsx:94-124, 171-197`; `backend/src/services/timesheet.service.ts:226-231`.
- The ‹ › controls change the `weekStart` **of the currently open timesheet** (they do not navigate which week's data is shown). Save Draft then `PATCH /timesheets/:id` with the new `weekStart`, relocating the whole timesheet (entries included) to the other week. Outcomes: (a) reported hours shift weeks with no warning, (b) collision with the unique index `(userId, projectId, weekStart)` if the target week already has a timesheet (error swallowed per H1), (c) entries displayed under a week they were never worked.
- Inconsistency: the "New Timesheet" modal (`pages/user/Timesheets.tsx`) only creates timesheets for the **current** week, while the editor allows moving a timesheet to any past week — two conflicting models for creating past-week entries.

### H4. Review-panel permission model contradicts the backend — Approve/Decline buttons that always 403
- **Where:** `frontend/src/components/approvals/ReviewPanel.tsx:37-49` vs `backend/src/middleware/access.ts:48-57`.
- The panel's local `canReviewTimesheet` allows a supervisor who is the **employee's assigned supervisor** or merely a **team member** of the project. The backend route middleware `requireTimesheetReview` only allows **admin** or the **project's `supervisorId`**. Supervisors in allowed-by-UI-but-denied-by-API cases see working buttons, confirm, then get `[FORBIDDEN] Review access denied to this timesheet`.
- Compounding it, `backend/src/services/approval.service.ts:15-28` defines a **third**, permissive `canReviewTimesheet` (matching the UI) that is never reached because route middleware runs first — triplicated, drifting permission logic.

### H5. Users can (and are invited to) approve their own timesheets **[FIXED — 2026-09-12]**
- **Where:** `backend/src/middleware/access.ts:48-57` — `canReviewTimesheet` does not exclude `timesheet.userId === reviewerId`.
- A supervisor who supervises a project they work on sees their own submitted timesheet in `/supervisor/approvals` and can approve/decline it; admins likewise. Separation of duties is not enforced anywhere.
- **Fix:** added `if (timesheet.userId.toString() === userId) return false` in `access.ts canReviewTimesheet` (admin branch kept first, so admins remain exempt and can review their own). Frontend `ReviewPanel.canReviewTimesheet` now applies the same self-review exclusion and no longer renders Approve/Decline for the owner. Defense-in-depth: `approval.service.ts` approve/decline route through the same middleware check. Covered by `access.test.ts` (self-review denied; admin self-review allowed) and `approvals-service.test.ts` (approve/decline throw for owner; admin self-approve succeeds).

### H6. Supervisors cannot get the user directory their pages depend on
- **Where:** `backend/src/routes/users.ts:9` (admin-only `GET /users`) and every supervisor page (`pages/supervisor/*.tsx`, `ReviewPanel`, admin ProjectDetails team tab) which resolves names/subordinates from the `users` array in `AppDataContext`.
- Even after C1 is fixed, a supervisor has **no wired endpoint** to fetch names: `GET /supervisors/:id/users` exists but is never called by `AppDataContext`. Until then, employee columns render `-` and the "supervised users" filter set is empty for non-admins.

### H7. User deactivation has no confirmation and always reports success **[FIXED — 2026-09-12]**
- **Where:** `frontend/src/pages/admin/UserDetails.tsx:46-49, 87`.
- "Deactivate User" calls `deactivateUser` **immediately** from the dropdown (no `ConfirmDialog`, unlike project deletion which confirms) and then unconditionally toasts **"User deactivated successfully"** — including when the backend refused (self-deactivation, last active admin). The result value is never checked.

### H8. Document download is wired to private blob URLs, not the authenticated download endpoint
- **Where:** `frontend/src/pages/admin/ProjectDetails.tsx:319-324` links directly to `doc.url`; uploads use `access: 'private'` (`document.controller.ts:37-40`).
- Vercel Blob **private** URLs are not publicly readable — the anchor 403s or breaks. The correct `GET /:documentId/download` endpoint (streams via `download(storageKey, userId)`) is never used by the frontend. `pages/user/ProjectDetails.tsx:120-136` has **no download action at all**, and its "Export" button has no `onClick` (decorative).

---

## 🟡 Medium

### M1. Notification helpers query the wrong parameter
`frontend/src/services/notificationService.ts:8-12` sends `GET /notifications?unread=true`; the backend schema (`schemas/notification.schema.ts`) only understands `read=true|false` and silently strips unknown keys → returns **all** notifications, not unread ones. (Function appears unused, but it's a landmine.)

### M2. Unread count is capped at 50
`backend/src/controllers/notification.controller.ts:21-24` computes `unreadCount` from `getNotificationsByUserId(..., { read: false })`, whose default `limit` is 50 (`notification.service.ts:58`). A user with >50 unread shows a badge stuck at 50 forever. Should be a `countDocuments`.

### M3. `GET /timesheets` ignores the `userId` query param; several service functions are dead or wrong
`backend/src/controllers/timesheet.controller.ts:30-35` reads only `projectId/status/weekStart`. So `getTimesheetsByUserId` / `getTimesheetsBySupervisorId` (`frontend/src/services/timesheetService.ts`) return role-scoped data, not the requested filter. Also dead/nonsensical: `searchTimesheets` (matches on project **IDs**), `getProjectsByUserId`, `getProjectsBySupervisorId`, `searchUsers`, `searchProjects`, `getCurrentWeekTimesheet` — none of those query params are supported server-side.

### M4. Settings pages are theater — nothing persists to the backend
- `frontend/src/pages/user/Settings.tsx:55-67`: Name/Email are editable inputs, but "Save" writes **only** notification prefs + theme to `localStorage` — profile edits are silently discarded (no self-service profile PATCH; `PATCH /users/:id` is admin-only). There is **no password change** anywhere (backend forgot/reset are 501 stubs, `auth.controller.ts:70-76`).
- `frontend/src/pages/admin/Settings.tsx:40-193`: Timezone, weekly start day, workdays, standard weekly hours, weekend-overtime toggle, and all notification toggles are `localStorage`-only. The backend **hardcodes** Monday normalization and Mon–Fri/Sat–Sun rules (`timesheet.service.ts:45, 72-116`), so none of these admin controls affect real behavior. Logo upload reads any file with no type/size validation and stores base64 in `localStorage`.
- The editor's "Weekly Target" is hardcoded to 40 (`TimesheetEditor.tsx:167`) regardless of the admin's "Standard Weekly Hours".

### M5. Dark-mode toggle does nothing visible
`user/Settings.tsx:49-53` toggles the `dark` class on `<html>`, but no component uses `dark:` variants (grep: zero usages) — the app has no dark theme.

### M6. Login page dead controls
`pages/auth/AdminLogin.tsx:126-138`: "Remember me" is a stateful checkbox wired to nothing (access token is intentionally memory-only), and "Forgot password?" is a `<button type="button">` with **no onClick** — while the backend endpoint it would call is a 501 stub.

### M7. "This Week" stat on the user dashboard is wrong for multi-project weeks
`pages/user/Dashboard.tsx:34-41` — `myTimesheets.find((t) => t.weekStart === currentWeekStart)` returns the **first** match only. Timesheets are unique per *project+week* by design, so a user logging time against 3 projects sees one project's hours as "This Week" and the card deep-links to one arbitrary timesheet. Summation is required.

### M8. Reports count draft/declined/withdrawn hours as worked hours
`backend/src/services/report.service.ts:50-73` — `buildMatchStage` has **no status filter**. `hours-by-project`, `hours-by-employee`, and `overtime` aggregate **all** timesheets including drafts, declined and withdrawn submissions — payroll/BI totals over-count. Also `buildMatchStage:68-70`: when both `userId` and `department` are supplied, the department branch **overwrites** `match.userId` silently.

### M9. Approval list scoping mismatch (UI vs API)
`GET /approvals` with `reviewerId` (`approval.service.ts:30-65`) returns pending timesheets for projects the supervisor **supervises or is a member of**, plus users they supervise. The supervisor UI (`pages/supervisor/Approvals.tsx:21-23`) computes access only from `projects.supervisorId === user.id` and `users.supervisorId === user.id` — items returned by the API can be missing from the UI (and vice-versa); with C1/H6 the user-side set is empty anyway.

### M10. Admin guardrails surface as generic failures
Backend protections exist (`user.controller.ts:83-97`: self role change, last-admin demotion/deactivation), but the admin UI (EditUser/UserDetails) neither pre-checks nor checks results (H7 pattern) — the admin discovers the rule only via a 400 toast after the fact.

### M11. Notifications UX: click-through goes to lists, not the related item; no live updates
`pages/user/Notifications.tsx:49-60` — all submission/approval notifications navigate to `/user/submissions`; deadline/assignment/document ones to `/user/projects`, ignoring `relatedId`. There is **no polling/websocket** — the bell only updates when some user action triggers a refresh; a background tab never learns of approvals.

### M12. Timezone rendering inconsistencies for non-UTC users
Week ranges in tables are computed with `new Date(timesheet.weekStart)` (UTC midnight) then rendered with `formatDate` (uses `parseISO`, local midnight) — see `user/Timesheets.tsx:158-163`, `Submissions.tsx:50-52`, `supervisor/Timesheets.tsx:121-128`, `supervisor/Approvals.tsx:92-99`, `ReviewPanel.tsx:66-68`, `admin/ProjectDetails.tsx:284-290`. For UTC-negative timezones a "Mon – Fri" range renders as "Sun – Thu". The date-fns helpers in `utils/date.ts` do it correctly; the pages bypass them.

### M13. Session/auth edge cases
- `logout` requires `authenticate` (`routes/auth.ts:11`): with an expired access token and no refresh cookie, server-side session deletion fails (401) and the **refresh cookie is not cleared server-side**.
- The same HS256 secret signs access **and** refresh tokens and both are verified identically (`lib/jwt.ts`); a refresh token presented as a Bearer token passes `verifyAccessToken` (payload fields end up `undefined`, guarded only by downstream `!== 'admin'` checks) — no explicit token-type separation.
- Refresh sessions stored **plaintext** (`auth.service.ts:54-59`); the `sessionId` claim is actually the user id (`auth.service.ts:100`); no token rotation on refresh; no reuse detection.
- Role changes take up to 60s to propagate (in-memory cache TTL, `middleware/auth.ts:26`); `invalidateUserCache` is called on deactivation only, not on role change.

### M14. Rate limiting vs real usage
`backend/src/app.ts:49-62`: prod auth limiter is **10 req/min per IP across all of `/api/v1/auth`** (login *and* refresh). An office behind one NAT — or one user with several tabs refreshing tokens — trips 429s; the frontend retries once after ~1s which usually still fails. The global 120/min limiter is also easy to hit because the SPA refetches everything on login and most mutations trigger full `refreshTimesheets()` reloads.

### M15. Regex injection in search
`user.service.ts:54-59`, `project.service.ts:83-89` pass user input straight into `$regex` (no escaping/anchoring). Metacharacters (`.*`, `(`) cause Mongo errors or pathological scans.

### M16. `documentIds` on projects is dead data
Defined/returned (`project.service.ts:24,71`) but never written or read; documents relate only via `documents.projectId`. Misleading API contract.

### M17. Editor entry IDs can collide
`TimesheetEditor.tsx:51,143` uses `entry-${Date.now()}` — two entries added in the same millisecond produce duplicate React keys and wrong row updates.

### M18. Admin dashboard drops archived projects from the status breakdown
`admin/Dashboard.tsx:42-50` counts only `active/completed/overdue/draft`; `archived` projects are invisible in the breakdown though the type includes them.

---

## ⚪ Low / hygiene

- **Dead code:** `frontend/src/utils/permissions.ts` is imported by nothing and reads `localStorage['eniac_projects'] / ['eniac_users']` — keys **nothing ever writes** (grep-verified). If it were ever wired back in, every supervisor check would silently return `[]`. The whole `src/mock/` directory is likewise unused, as are most "by X" service helpers (M3).
- **Duplicated approval logic:** `approval.service.ts` and `timesheet.service.ts` both implement `approveTimesheet`/`declineTimesheet` (the approval one adds notifications/activity; the timesheet one is bare) — drift risk, already realized as H4.
- **Zustand is a declared dependency but unused** — state is all React Context; adopt it or drop it.
- **No pagination anywhere** on list endpoints (users/projects/timesheets/activities; notifications default 50) — `find().toArray()` unbounded for users/projects/activities.
- **Supervisor "Team Timesheets" Review button** (`supervisor/Timesheets.tsx:135`) navigates to `/supervisor/approvals` regardless of which row was clicked, losing context.
- **User dashboard greeting is hardcoded** "Good morning" (`user/Dashboard.tsx:74`) while the admin dashboard has a time-based `getGreeting()` — users get "Good morning" at 11pm.
- **Demo credentials are hardcoded in the client bundle** (`services/authService.ts:14-21`, `Password123!`) and demo-login buttons sit on the production login screens — fine for a demo build, a real problem for any real deployment.
- **Repository hygiene:** `backend/dist/**` build output committed to git; a stray accidental file at `home/nikhil/Alpha-net/backend/src/tests/projects.test.ts` nested under the repo root; deleted-but-uncommitted `QA_REPORT.md` and resume PDF in the working tree; commit messages are all `\/`; root `package.json` carries two stray devDependencies (`@types/bcryptjs`, `@types/express`) that belong to the backend.
- **Test suite gap:** all 125 backend tests mock Mongo/JWT/bcrypt. No test covers the real auth cookie flow, the cron route (would have caught C3), or documents listing (would have caught C2). The green suite creates false confidence.
- **Minor UI/accessibility:** modals/confirm dialogs have no focus trap or Escape handling; the "file type" button in admin ProjectDetails has a meaningless `aria-label="File type"`; small (w-16) numeric day inputs are error-prone on mobile.

---

## Verified-good (for balance)
- Unique index on `(userId, projectId, weekStart)` + E11000 friendly error; week normalized to Monday server-side.
- httpOnly, path-scoped refresh cookie; access token memory-only; single-flight 401 refresh in `apiClient`.
- IDOR-safe notification read (ownership in the update filter → 404).
- Last-admin / self-role-change / self-deactivation guards on the backend.
- File upload validation (MIME allowlist + 10 MB cap) and sanitized storage keys; upload/delete produce activity + notification side effects.
- Session pruning (max 5) and TTL index on `sessions.expiresAt`.
- Password policy (8+, upper/lower/digit) mirrored client- and server-side.
- CSRF posture is reasonable given the Bearer-token + path-scoped, sameSite=lax cookie design.

---

## Suggested fix priority
1. **C1** (isolate the users fetch for non-admins / scope `GET /users` or use `/supervisors/:id/users`) — restores the entire non-admin experience.
2. **H1** (stop swallowing errors; check results before success toasts) — stops silent data loss.
3. **C2 + H8** (per-project document fetch + authenticated download) — restores documents.
4. **C3** (mount cron route before `authenticate`).
5. **H2 + H3** (mirror backend day rules locally; make week ‹ › a true navigation or warn before moving).
6. **C4 + H4 + H5** (scope `GET /activities`, align review permissions to the backend, block self-review).
7. Then the Medium tier (M2, M4, M7, M8 are the most user-visible).

---

## Fix-Tracking Checklist

Work top-down (severity order matches the report). Tick `- [x]` as items land and append the PR/commit reference in brackets. Sub-items break a finding into the discrete code changes needed.

### 🔴 Critical
- [x] **C1 — Non-admin initial data load fails** (`AppDataContext.tsx:78-86`, `routes/users.ts:9`) **[FIXED — safe directory endpoint + allSettled load + failure toast]**
  - [x] Isolate each fetch so a 403 on `GET /users` can't reject the whole `Promise.all` (per-request `.catch` or `Promise.allSettled`) — `AppDataProvider` now uses `Promise.allSettled` with per-array fallbacks
  - [x] Give non-admins a directory source: wire `GET /supervisors/:id/users` into `AppDataContext`, or make `GET /users` return a safe self/team projection — chose the latter: `listUsers` now returns a scoped directory (self + project teammates/supervisor/manager + own supervisor + subordinates) for non-admins, withholding `email`/`employeeId`; admins keep the full list
  - [x] Surface partial-load failures to the user (toast/error state; no silent empty dashboards, no unhandled rejections) — toast when any of the 6 fetches rejects; defensive `.catch` kills unhandled rejections
  - [x] Regression test: login as `role: 'user'` populates projects, timesheets, notifications, activities — added `src/tests/users-directory.test.ts` (3 tests: non-admin 200 + scoped IDs + no email/employeeId leak; supervisor sees subordinates; admin sees full list). Full suite: **13 files / 128 tests pass**
- [x] **C2 — Documents never fetched; list always empty** (`documentService.ts:4-7`, `AppDataContext.tsx:83`) **[FIXED — 2026-09-11]**
  - [x] Fetch documents per accessible project after initial load (or add a store-level list endpoint) — added store-level endpoint: `GET /api/v1/documents` (`myDocumentsRoutes`) returns documents for all projects the requester can access; admins see org-wide, non-admins scoped per `getProjectsForUser`. `myDocumentsController.listMyDocuments` calls `getAllDocuments()` for admins and `getDocumentsByProjectIds(projectIds)` for non-admins
  - [x] Keep the store in sync after upload/delete (per-project refresh instead of appending to an always-empty array) — `refreshDocuments()` now calls the store-level endpoint and writes the full set into state; upload/delete both call `refreshDocuments()` so the list stays correct
  - [x] Regression test: document uploaded at project creation appears in ProjectDetails after a reload — added `src/tests/documents-store.test.ts` (3 tests: admin sees all org documents; non-admin sees only accessible-project documents and the unrelated project's doc is excluded; empty list when no accessible projects). Full suite: **14 files / 131 tests pass**
- [x] **C3 — Cron deadline endpoint unreachable** (`routes/notifications.ts:7-13`) **[FIXED]**
  - [x] Mount `POST /notifications/cron/deadline` **before** `router.use(authenticate)` (the secret check already protects it)
  - [x] Integration test: request with only `Bearer CRON_SECRET` reaches the handler and returns `{ sent }` — added `src/tests/notifications-cron.test.ts` (6 tests: valid secret → 200 + `{ sent }`; missing/wrong secret → 401; empty CRON_SECRET → 500; thrown handler → 500; malformed JWT → cron-specific 401 not JWT 401). Full suite: **15 files / 137 tests pass**
- [ ] **C4 — `GET /activities` unscoped; activity log-forging** (`activity.controller.ts:14-27`, `routes/activities.ts:15`)
  - [ ] Scope `listActivities`: admin → all; supervisor → their projects/subordinates; user → own + member projects
  - [ ] Enforce `canAccessProject` on the `projectId` filter for non-admins
  - [ ] Bound `description` length on `POST /activities` (e.g. ≤500 chars) and consider stricter access
  - [ ] Test: employee requesting `GET /activities?projectId=<foreign-id>` gets 403/filtered results

### 🟠 High
- [x] **H1 — Swallowed errors + false success toasts** (`AppDataContext.tsx:212-270`, `TimesheetEditor.tsx:188-258`) **[FIXED — 2026-09-12]**
  - [x] Preserve error messages in context handlers (rethrow or return `{ ok, error }` instead of `catch { return undefined }`) — the five timesheet handlers in `AppDataContext` now rethrow, so the backend message reaches the caller's `catch` verbatim
  - [x] `handleSaveDraft`, `handleSubmit`, `handleWithdraw` check the result **before** showing success toasts — falsy results now show an error toast and keep the editor/modal open (no success toast, no navigate-away)
  - [x] Show backend validation strings (day rules, E11000) verbatim in the editor when a save/submit fails — error toasts surface `err.message` (e.g. `[VALIDATION_ERROR] …`) since the context no longer swallows it
- [x] **H2 — Day-rule validation parity; hidden hours submitted** (`TimesheetEditor.tsx:69-84,138-140`) **[FIXED — 2026-09-12]**
  - [x] Zero-out (or confirm) hours for days that don't match the entry type when switching type — `handleEntryTypeChange` zeroes out Sat/Sun when switching to Regular and Mon–Fri when switching to Overtime, with an informational toast listing exactly what was removed (no silent data loss)
  - [x] Mirror backend `validateEntries` client-side (regular=Mon–Fri, overtime=Sat–Sun) with inline messages — `getValidationErrors` now enforces the same day rules (plus non-negative and ≤24h/day checks) with messages matching the backend wording, shown in the editor's inline error list before any save/submit
- [x] **H3 — Week ‹ › mutates the open timesheet** (`TimesheetEditor.tsx:94-124`, `timesheet.service.ts:226-231`) **[FIXED — 2026-09-12]**
  - [x] Make the arrows **navigate** weeks (load/create that week's timesheet) instead of editing the open one's `weekStart` — the editor arrows now open the adjacent week's existing timesheet (same user+project) or create a fresh draft for that week; the open timesheet's `weekStart` is never mutated (navigation uses local-time math via `parseLocalDate`/`addWeeks`)
  - [x] If week relocation is kept as a feature, require explicit confirmation and pre-check the `(userId, projectId, weekStart)` collision — relocation is **removed entirely**: the client can no longer change an open timesheet's week, and `updateTimesheet` now rejects any `weekStart` change (`Cannot move a timesheet to a different week…`), which is stronger than confirm + pre-check
  - [x] Add a supported "create timesheet for past week" path on My Timesheets (aligns with Feature_Report §2.5) — the New Timesheet modal now has a **Week starting (Monday)** date picker (defaults to current week), snapped to Monday via `normalizeToMonday`, with the existing duplicate pre-check applied to the chosen week
- [x] **H4 — Review permission mismatch (UI vs middleware)** (`ReviewPanel.tsx:37-49`, `access.ts:48-57`, `approval.service.ts:15-28`) **[FIXED — 2026-09-12]**
  - [x] Pick one authority (backend route middleware) and delete the duplicated `canReviewTimesheet` implementations — `access.ts` remains the single authority (admin OR the timesheet's project `supervisorId`, covered by 6 tests in `access.test.ts`); `ReviewPanel`'s UI check now mirrors it exactly (drops the former employee's-supervisor and team-member allowances, so buttons no longer appear when the API would 403); the permissive copy in `utils/permissions.ts` was deleted, and the duplicate in `approval.service.ts` was removed — the service's defense-in-depth re-check now calls the **same** `canReviewTimesheet` from `access.ts` (covered by new `approvals-service.test.ts`)
  - [ ] Compute reviewability on the frontend from the same rule (admin or project's `supervisorId` only)
  - [ ] Hide Approve/Decline when review isn't possible; show an explanatory state instead
- [x] **H5 — Self-approval possible** (`access.ts:48-57`)
    - [x] Reject review when `timesheet.userId === reviewerId` (document any deliberate admin exception)
  - [ ] Test: a supervisor cannot approve/decline their own timesheet
- [x] **H6 — No user directory for supervisors** (`routes/users.ts:9`) **[FIXED by C1 — safe directory projection]**
  - [x] Wire `GET /supervisors/:id/users` (plus project team membership) into `AppDataContext` for non-admins — resolved via C1's alternative: `GET /users` now returns the scoped directory for non-admins, which `AppDataContext` already stores
  - [x] Replace `users.find(...)` name lookups on supervisor pages / ReviewPanel with that source — no frontend change needed; all pages read the `users` array from context, which now populates for non-admins
- [x] **H7 — Deactivate without confirmation / false success** (`UserDetails.tsx:46-49,87`)
  - [x] Add a `ConfirmDialog` to deactivation (match the project-delete pattern) — added `<Modal>` confirmation; "Deactivate User" in the dropdown now opens it instead of firing instantly
  - [x] Check the result; surface the backend error (self-deactivation, last active admin) instead of unconditional success — `handleDeactivate` now checks the returned user and `catch`es errors, toasting a real message (and navigates to `/login` if the admin deactivated themselves)
- [ ] **H8 — Broken document downloads** (`admin/ProjectDetails.tsx:319-324`, `user/ProjectDetails.tsx:120-136`) **[partial — list fixed by C2; downloads still open]**
  - [x] Give the document store a working list endpoint (done in C2 — `GET /api/v1/documents` now returns the visible document set)
  - [ ] Route downloads through the authenticated `GET /:documentId/download` endpoint (fetch → blob → object URL) — still uses private blob URLs, which 403
  - [ ] Add a working download action on the employee ProjectDetails
  - [ ] Wire or remove the dead "Export" button

### 🟡 Medium
- [ ] **M1** — Fix or remove `getUnreadNotifications` (`?unread=true` → `read=false`) (`notificationService.ts:8-12`)
- [ ] **M2** — Compute unread count with `countDocuments` (remove the 50 cap) (`notification.controller.ts:21-24`)
- [ ] **M3** — Support `userId` on `GET /timesheets` or delete the dead service helpers (`timesheet.controller.ts:30-35`, `timesheetService.ts`, `projectService.ts`, `userService.ts`)
- [ ] **M4** — Make Settings real: wire profile/password/notification prefs and admin config to backend endpoints, or remove the controls (`user/Settings.tsx:55-67`, `admin/Settings.tsx:40-193`)
  - [ ] Self-service profile update endpoint (name/email) or make the fields read-only
  - [ ] Password change flow (endpoint + UI) or remove the expectation
  - [ ] Drive weekly-target/day rules/notifications from admin config or remove the config
- [ ] **M5** — Implement a dark theme or remove the toggle (`user/Settings.tsx:49-53`)
- [ ] **M6** — Remove or wire "Remember me" / "Forgot password?" (`AdminLogin.tsx:126-138`; backend stubs at `auth.controller.ts:70-76`)
- [ ] **M7** — Sum all same-week timesheets for the dashboard "This Week" card (`user/Dashboard.tsx:34-41`)
- [ ] **M8** — Reports: add status filter (approved-only by default); fix `userId`/`department` overwrite (`report.service.ts:50-73`)
- [ ] **M9** — Align `GET /approvals` scoping with the supervisor UI filter (or vice versa) (`approval.service.ts:30-65`, `supervisor/Approvals.tsx:21-23`)
- [ ] **M10** — Pre-check admin guardrails in the UI (self-role-change, last-admin demotion/deactivation) instead of post-hoc 400s (`EditUser.tsx`, `UserDetails.tsx`)
- [ ] **M11** — Notifications: deep-link to the related item (`relatedId`); add polling/SSE for live updates (`user/Notifications.tsx:49-60`, `Topbar.tsx`)
- [ ] **M12** — Normalize week-range rendering through `utils/date.ts` helpers everywhere (UTC-safe) (`user/Timesheets.tsx:158-163`, `Submissions.tsx:50-52`, `supervisor/Timesheets.tsx:121-128`, `supervisor/Approvals.tsx:92-99`, `ReviewPanel.tsx:66-68`, `admin/ProjectDetails.tsx:284-290`)
- [ ] **M13** — Auth hardening (`routes/auth.ts:11`, `lib/jwt.ts`, `auth.service.ts:54-100`, `middleware/auth.ts:26`)
  - [ ] Clear the refresh cookie server-side even when the access token is expired (logout robustness)
  - [ ] Separate access/refresh token secrets or add a `typ`/audience claim check
  - [ ] Hash refresh sessions at rest; rotate the refresh token on use; add reuse detection
  - [ ] Call `invalidateUserCache` on role/status change, not just deactivation
- [ ] **M14** — Rate-limit review: key refresh by user, raise/replace the 10/min auth budget for offices behind NAT (`app.ts:49-62`)
- [ ] **M15** — Escape/anchor user input in `$regex` search (`user.service.ts:54-59`, `project.service.ts:83-89`)
- [ ] **M16** — Remove `documentIds` from the Project contract or start maintaining it (`project.service.ts:24,71`)
- [ ] **M17** — Collision-safe editor entry IDs (`crypto.randomUUID()`) (`TimesheetEditor.tsx:51,143`)
- [ ] **M18** — Include `archived` in the admin dashboard status breakdown (`admin/Dashboard.tsx:42-50`)

### ⚪ Low / hygiene
- [ ] Delete or rewire dead code: `utils/permissions.ts`, `src/mock/*`, unused service helpers (`searchTimesheets`, `getProjectsByUserId`, `searchUsers`, …)
- [ ] Deduplicate approve/decline logic into a single service implementation
- [ ] Adopt or remove the unused Zustand dependency
- [ ] Add pagination/limits to users, projects, timesheets, activities lists
- [ ] Supervisor Team-Timesheets "Review" opens the specific timesheet, not the top of Approvals (`supervisor/Timesheets.tsx:135`)
- [ ] Time-based greeting on the user dashboard (`user/Dashboard.tsx:74`)
- [ ] Remove hardcoded demo credentials/buttons from production login screens (`authService.ts:14-21`)
- [ ] Repo hygiene: remove `backend/dist/**` from git, delete the stray `home/nikhil/Alpha-net/...` nested file, resolve pending uncommitted changes, use meaningful commit messages, prune the root `package.json` devDeps
- [ ] A11y polish: focus traps + Escape-close for modals, meaningful aria-labels, larger day inputs
- [ ] Document the Regular/Overtime day rules in the UI copy (tooltip/help text)

### 🧪 Test gaps (add to prevent regressions)
- [ ] Integration test with real/in-memory Mongo for the auth cookie flow (login → refresh → logout)
- [ ] Test the cron deadline route with only `CRON_SECRET` (guards C3)
- [ ] Test documents list/download against the real blob contract (guards C2/H8)
- [ ] Tests for activities scoping (guards C4)
- [x] Tests for the self-approval block (guards H5) and review-permission parity (guards H4)

### Progress summary
| Tier | Findings | Fixed |
|------|----------|-------|
| 🔴 Critical | 4 | 3 (C1, C2, C3) |
| 🟠 High | 8 | 3 (H6 by C1, H5, H7) |
| 🟡 Medium | 18 | 0 |
| ⚪ Low / hygiene | 10 | 0 |
| 🧪 Test gaps | 5 | 1 (self-approval block for H5) |

> Note: H8 is partially fixed — its "no document list" sub-problem is resolved by C2; downloads (private blob URLs, no employee download action) remain open.
