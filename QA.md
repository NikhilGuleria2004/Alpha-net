# Alpha-net (Eniac) — QA Report

**Scope:** Findings from a codebase analysis performed 2026-09-14: structural review of `frontend/` (React 19 + Vite + TS) and `backend/` (Express + MongoDB) — app wiring (`app.ts`, routes, middleware, services, contexts, `apiClient.ts`), data model (`lib/collections.ts`, `schemas/`), and dependency manifests — plus execution of the backend test suite.

**Method:** Static review with file:line citations, cross-checked against route wiring and data flow, plus execution of the backend test suite. The first pass (`cd backend && npm test`) found **21 files, 175 tests — 173 passed, 2 failed** (`src/tests/settings.test.ts`). A follow-up debugging session the same day traced a live "logged out on every reload" incident to a stale refresh cookie and fixed it (A11); the suite now runs **21 files, 179 tests, all passing**.

Issue IDs use the fresh `A` series for this audit (A1–A12; A11–A12 were added by the follow-up session).

Severity legend: 🔴 Critical (breaks core functionality or security) · 🟠 High (breaks a feature or hides defects) · 🟡 Medium (incorrect behavior or hygiene risk) · ⚪ Low / polish.

---

## 🔴 Critical

### A1. Org-settings routes run without `authenticate` — the Admin Settings page is dead for everyone, admins included [FIXED — 2026-09-14]
- **Where:** `backend/src/routes/settings.ts:10-21` — `router.get('/', requireAdmin, getOrgSettingsHandler)` and `router.put('/', requireAdmin, putOrgSettings)` mount with **no `authenticate` before `requireAdmin`**. Every other route file mounts `router.use(authenticate)` first (`routes/users.ts:8`, `routes/reports.ts:7`).
- **Root cause:** `req.user` is populated exclusively by `authenticate` (`middleware/auth.ts:46-72`); `requireAdmin` only checks `req.user?.role`. With `authenticate` missing, `req.user` is always `undefined`, so **every** request to `GET/PUT /api/v1/settings` — including valid admin tokens — short-circuits to `403 FORBIDDEN "Admin access required"`.
- **Symptom:** the admin Settings page can never load or save org settings (timezone, weekly start day, workdays, standard weekly hours, weekend-overtime rule, notification toggles, company name/logo).
- **Also wrong:** unauthenticated calls receive a misleading `403` instead of `401`.
- **Evidence:** `npm test` on 2026-09-14 — 2 failures in `src/tests/settings.test.ts`: "returns default org settings when none exist" (line 93) and "persists org settings updates (admin)" (line 110), both `expected 403 to be 200`. Note the third test, "rejects non-admin access to org settings with 403" (line 98), **passes for the wrong reason** — it expects 403 and gets 403, but because of the missing auth chain, not role rejection — which is why this bug stayed invisible.
- **Fix plan:**
  - [x] Add `router.use(authenticate)` as the first line of `settingsRoutes()` in `backend/src/routes/settings.ts` (mirroring `users.ts`/`reports.ts`) — done, with a comment explaining the original bug.
  - [x] Re-run `npm test` in `backend/` — both previously failing settings tests now pass; the non-admin 403 test passes for the right reason. Suite: 21 files, 179 tests, all passing.
  - [x] Add regression tests for the chain itself: unauthenticated `GET /api/v1/settings` → **401** (new test in `settings.test.ts`); valid-admin token → **200** and valid-user token → **403** (already covered).
  - [ ] Manually verify the admin Settings page loads defaults and persists an update.
  - [x] Audit sweep: checked every `routes/*.ts` — all mount `router.use(authenticate)` before any `requireAdmin` / `requireSupervisor` / `requireUserManage` / `requireProjectAccess` / `requireTimesheetAccess` guard (`auth.ts` uses explicit per-route middleware). No other route had the missing-authenticate defect.

---

## 🟠 High

### A2. Backend suite is red: 2 of 175 tests failing (direct evidence of A1) [FIXED — 2026-09-14]
- **Where:** `backend/src/tests/settings.test.ts` — run 2026-09-14: `Test Files 1 failed | 20 passed (21)`; `Tests 2 failed | 173 passed (175)`. Failures: "returns default org settings when none exist" and "persists org settings updates (admin)".
- **Impact:** with no CI gate, the suite can drift red silently and mask new regressions.
- **Fix plan:**
  - [x] Resolve via A1 (the failures shared that root cause — assertions were not loosened) — done, suite fully green.
  - [ ] Wire `npm test` into CI (e.g. GitHub Actions) with a red = block policy for both halves.
  - [x] Add auth-chain tests so a missing `authenticate` can never again present as a role rejection — done: unauthenticated → **401** on `GET /settings` (`settings.test.ts`) and on `POST /refresh` (`auth.test.ts`), plus stale-cookie clearing tests (A11).

### A3. All 175 backend tests are unit tests with mocked Mongo/JWT — integration seams are untested [OPEN]
- **Where:** `backend/vitest.config.ts` + `vi.mock('../lib/mongodb.js')` / `vi.mock('../lib/jwt.js')` across the suite; no test exercises the real middleware chain end-to-end.
- **Why it matters:** A1 slipped past 175 (mostly green) tests because route wiring — not logic — was broken. Mocked suites structurally cannot catch missing-middleware bugs.
- **Fix plan:**
  - [ ] Add one smoke test per route file (`auth`, `users`, `settings`, `reports`, …) that builds `createApp()` and asserts the chain: unauthenticated → 401, wrong role → 403, authorized → 200.
  - [ ] Consider `mongodb-memory-server` for service-level tests so collection/index behavior is real.
  - [ ] Strengthen weak assertions: where a status distinction matters (401 vs 403), assert the error body's `code`/`message`, not just the status.

### A4. In-memory auth user cache is per-process — stale roles/sessions on serverless [OPEN]
- **Where:** `backend/src/middleware/auth.ts:16-44` — module-level `Map` keyed by userId with a 60s TTL; `invalidateUserCache()` only clears the local instance.
- **Why it matters:** deployed on Vercel (serverless), warm instances can serve a deactivated/demoted user for up to 60s after the change, while cold starts bypass the cache entirely; the map also grows unbounded (one entry per active userId per instance).
- **Fix plan:**
  - [ ] Decide per environment: single-instance dev is fine; in serverless production either shorten the TTL (5–10s) or drop the cache — the DB path is a cheap indexed `_id` lookup.
  - [ ] If kept, cap it (LRU/size limit) and document the staleness window at the top of the file.
  - [ ] Keep the DB lookup (with `status: 'active'` filter) mandatory for security-critical paths so revocation remains authoritative.

---

## 🟡 Medium

### A5. `PUT /settings` performs no schema validation [OPEN]
- **Where:** `backend/src/controllers/settings.controller.ts:21-37` — fields are hand-picked with `typeof` checks instead of a Zod schema, unlike every other mutating route (`schemas/*.schema.ts`). The route also imports no schema.
- **Risks:** `workdays` accepts any array (duplicates, unknown day strings); `standardWeeklyHours` accepts zero/negative/absurd values; unknown fields are silently dropped with no error to the admin UI; `companyName` has no length cap.
- **Fix plan:**
  - [ ] Add `updateOrgSettingsSchema` (and a notification-prefs schema) in a new `schemas/settings.schema.ts`: `workdays` constrained to the day enum (unique), `weeklyStartDay` to the day enum, `standardWeeklyHours` to a sane numeric range, string length caps.
  - [ ] Validate in the route chain and return the standard `VALIDATION_ERROR` shape used elsewhere.
  - [ ] Mirror the constraints client-side in `pages/admin/Settings.tsx` / `services/settingsService.ts`.

### A6. Repo hygiene: scratch scripts and unzipped Office artifacts tracked in git [OPEN]
- **Where:** `backend/test-mongo.mjs`, `backend/test-mongo-connect.mjs`, `backend/tmp-check-all.mjs` (the last untracked per `git status`); `AlphaNet_Technical_Architecture_and_Platform_Documentation.docx_FILES/` — 24 files of unzipped Word XML (`word/document.xml`, styles, rels, thumbnails) committed to the repo.
- **Fix plan:**
  - [ ] Delete the three scratch `.mjs` files; move any genuinely useful check into `src/scripts/` with a `package.json` entry.
  - [ ] Remove `docx_FILES/` from the repo; keep the original `.docx` in `docs/` or external storage instead of an exploded archive.
  - [ ] Add ignore patterns (`tmp-*.mjs`, `*.docx_FILES/`) to `.gitignore`.

### A7. Git history is unusable: every commit message is "/" [OPEN]
- **Where:** recent history is a run of `/` commits; HEAD `8e335af` is a 177-file, ±6.6k-line squash; no stashes exist as recovery points.
- **Impact:** `git bisect`, `git blame`, and review all degrade to noise; a bad deploy can't be tied to a change.
- **Fix plan:**
  - [ ] Going forward, use conventional commits (`fix(settings): ...`, `feat(timesheets): ...`) scoped per area.
  - [ ] Keep squash-merges but write a real message (the PR title/body is the bar, not one character).
  - [ ] Optional: split backend/frontend changes into separate commits when practical.

---

## ⚪ Low

### A8. Dependency-version drift between halves; frontend pins need verification [OPEN]
- **Where:** `frontend/package.json` — `typescript ~6.0.2`, `react ^19.2.8`, `vite ^8.2.2`, `tailwindcss ^4.3.3`; `backend/package.json` — `typescript ^5.3.3`, `express ^4.18.2` (while `@types/express` is already on v5).
- **Impact:** mixed TS majors across the monorepo (different type-checking behavior per half); several frontend pins are ahead of widely published releases and may fail to resolve on a fresh install.
- **Fix plan:**
  - [ ] From a clean clone run `npm ci && npm run build` in `frontend/` to confirm every pin resolves and compiles.
  - [ ] Align both halves on one TypeScript major.
  - [ ] Backlog an Express 4 → 5 migration (types are already prepared).

### A9. Demo credentials offered on production login screens [OPEN]
- **Where:** `frontend/src/pages/auth/AdminLogin.tsx` and `UserLogin.tsx` — "Demo Admin / Demo User / Demo Supervisor" buttons with hardcoded demo passwords in the shipped bundle.
- **Fix plan:**
  - [ ] Gate the demo buttons behind `import.meta.env.DEV` (or a `VITE_ENABLE_DEMO` flag) so production builds never ship them; strip the hardcoded passwords from the bundle.

### A10. `backend/.env` present in the working tree [OPEN]
- **Where:** `backend/.env` (verified currently ignored by `.gitignore`; real Mongo URI and secrets inside).
- **Fix plan:**
  - [ ] Keep it ignored; add a pre-commit secret scan (e.g. gitleaks) so a future `.gitignore` regression cannot leak the Mongo URI / JWT secret.

### A11. Stale refresh cookie survives failed refreshes — "logged out on every reload" loop [FIXED — 2026-09-14]
- **Symptom (live incident, 2026-09-14):** the user was logged out on every page reload; the console showed 401s on `/auth/me` and `/notifications/unread-count`, then `POST /auth/refresh` → 401; the backend logged `refresh failed` with **"Session not found or expired"** (`auth.service.ts:151`) while the browser kept presenting the same dead cookie.
- **Root cause:** the browser held a `refreshToken` cookie from a session whose row no longer exists (deleted via logout elsewhere / password change / a dev DB reset). `refreshUserSession` correctly rejected it — but the 401 response **never cleared the cookie**, so the browser re-sent the dead token on every request indefinitely. Recovery required manual DevTools cookie surgery. Server-side verification (login → cookie → refresh replayed via curl through the same Vite proxy) proved the auth chain itself was correct; the sessions for the recent logins were intact in Mongo.
- **Secondary finding:** on a logged-out load, `NotificationContext` fired `GET /notifications/unread-count` unconditionally on mount (seed effect ran with an empty dep array) and again in the badge-sync effect, generating the 401 spam (and refresh attempts) before any login — 3× per load with React StrictMode double-effects. The poller's interval closure also captured `isAuthenticated` at start time, so a logout wouldn't stop already-scheduled ticks.
- **Fixes:**
  - `backend/src/controllers/auth.controller.ts` — `refresh()` now clears the `refreshToken` cookie (attributes mirrored from `login()`: dev Lax / prod `None`+`Secure`) whenever a cookie was presented but rejected; no cookie → no `Set-Cookie` noise. `logout()` mirrors the same attributes in its `clearCookie`.
  - `frontend/src/contexts/NotificationContext.tsx` — the seed effect, badge-sync effect, and poller now run only while `isAuthenticated`; the badge resets to 0 on logout.
  - `frontend/src/contexts/AppDataContext.tsx` — the poll interval checks an `isAuthRef` per tick, so a logout stops polling even mid-interval.
- **Fix plan:**
  - [x] Clear the dead cookie on failed refresh (with attribute-mirrored `clearCookie`) — done.
  - [x] Guard all notification fetching/polling behind `isAuthenticated` — done.
  - [x] Regression tests in `auth.test.ts`: stale token → 401 + `Set-Cookie: refreshToken=; Expires=Thu, 01 Jan 1970`; invalid token → same; no cookie → **no** `Set-Cookie` — done.
  - [x] Confirm in the browser (2026-09-14, user-verified): log in → **reload now persists the session**, and the stale-cookie loop no longer reproduces — a failed refresh clears the dead cookie, so a broken session costs one clean logout instead of an infinite loop. (Deeper drill — deliberately deleting a Mongo session row and reloading — left as an optional exercise; the auth.test.ts coverage asserts the same behavior.)
  - [x] Diagnostics added: `login` logs `refreshTokenSuffix` and a failed `refresh` logs `presentedTokenSuffix` + the raw Cookie header (last 8 chars / first 120 chars only) so a browser-vs-server token mismatch is visible in the terminal without exposing JWTs.
  - [ ] Optional hardening: `getCurrentUser`'s refresh path and the apiClient 401 path currently both fire `POST /auth/refresh` on a cold load; consolidate through the single-flight helper to avoid redundant refresh POSTs (cosmetic — requests are cheap and correct).

### A12. Frontend production build fails (`tsc -b`): missing/unused imports left by the M12 edit [FIXED — 2026-09-14]
- **Where:** `npm run build` in `frontend/` failed with 13 type errors across `pages/user/Dashboard.tsx`, `Submissions.tsx`, `Timesheets.tsx` (uses of `formatWeekRange` / `parseLocalDate` without imports; unused `formatDate`), `pages/user/TimesheetEditor.tsx` (dead `weekEnd` memo), `pages/admin/Approvals.tsx` (missing `formatWeekRange` import), `components/approvals/ReviewPanel.tsx` (unused `formatDate`), `pages/admin/Dashboard.tsx` (missing `ProjectStatus` type import), `pages/admin/EditUser.tsx` (unused `canMakeSupervisor` import + dead `supervisorGuard`), `pages/supervisor/Timesheets.tsx` (unused `useSearchParams`), `utils/permissions.ts` (unused `allUsers` param on `canPromoteToAdmin`).
- **Impact:** the production build (`tsc -b && vite build`) has been broken independent of any deploy-time check — deploys from a machine that doesn't run the build first would fail or ship a stale bundle.
- **Fixes:** added the missing `formatWeekRange` / `parseLocalDate` / `ProjectStatus` imports; removed dead code (`weekEnd` memo, `supervisorGuard`, `canMakeSupervisor` import, `useSearchParams`); underscored the intentionally-unused `allUsers` param on `canPromoteToAdmin` (signature kept for API symmetry with the other M10 guards).
- **Fix plan:**
  - [x] Fix all 13 errors — done; `npm run build` now succeeds (`✓ built`) and `npm run lint` reports 0 errors.
  - [ ] Wire the frontend build into the same CI gate as `npm test` (see A2) so a broken build can't land silently.

### A13. Reopening the app lands on the login page despite a live session [FIXED — 2026-09-14]
- **Symptom (user-confirmed):** reload keeps the session, but closing the tab and reopening dumps the user on `/adminlog` — even though manually typing `/admin/dashboard` gets in without a login prompt (session alive the whole time).
- **Root cause:** `App.tsx` — the `/` route (and the `*` fallback) rendered an **unconditional** `<Navigate to="/adminlog" replace />` without consulting `AuthContext`; and the public auth pages (`/adminlog`, `/userlog`, `/register`) had no already-authenticated forward. The session restore itself works (the refresh cookie is persistent, `Max-Age=7d`; only the memory-only access token dies with the tab) — the app just never asked about it on those routes.
- **Fixes:**
  - New `routes/HomeRedirect.tsx` — waits for the auth restore (`isLoading` → spinner), then routes by role to the dashboard (admin → `/admin/dashboard`, everyone else → `/user/dashboard`, mirroring `ProtectedRoute`'s fallback); logged-out visitors get `/adminlog`. Mounted at both `/` and `*`.
  - New `routes/RedirectIfAuthenticated.tsx` — wraps `/adminlog`, `/userlog`, `/register`; an authenticated visitor is forwarded to their role dashboard instead of seeing the form.
  - New `components/ui/FullPageSpinner.tsx` — shared full-page loading state; `ProtectedRoute` reuses it instead of its inline copy.
- **Fix plan:**
  - [x] Add the two route gates + shared spinner — done.
  - [x] Wire `/`, `*`, and the three public auth pages — done; `npm run build` ✓, `npm run lint` 0 errors.
  - [ ] Verify in the browser: close the tab, reopen at `http://localhost:5173/` → should land on `/admin/dashboard` without a login prompt; `/adminlog` while logged in should bounce to the dashboard; logged-out fresh visitor should still land on `/adminlog`.

---

## Verified healthy during this review (no action)
- Auth token design: memory-only access token + httpOnly `SameSite=None` refresh cookie guarded by the `FRONTEND_URL` origin allowlist (`middleware/csrf.ts`); single-flight refresh with 401-retry, `Retry-After` backoff, 15s abort timeout, and multipart-awareness in `frontend/src/services/apiClient.ts`.
- Rate limiting: global limiter plus a two-axis auth limiter (per-email key + per-IP cap, env-configurable) at `app.ts:52-87`.
- Mongo index coverage in `lib/collections.ts`, including `userId+projectId+weekStart` uniqueness on timesheets and a TTL index on sessions.
- Route-level scoping helpers in `middleware/access.ts`, including the supervisor self-review prohibition.

## Removed (2026-09-14, per product decision)
- **Dark mode** has been removed entirely at the user's request: `contexts/ThemeContext.tsx` deleted; `ThemeProvider` unwrapped from `main.tsx`; the "Appearance / Dark Mode" card dropped from `pages/user/Settings.tsx`; the `.dark` token palette removed from `index.css` (the `:root` light palette is now the app's single theme; components' token-driven utilities are unaffected). Stale `theme` keys in users' localStorage are inert — nothing reads them.

## Verification snapshot (2026-09-14)
- Backend: `cd backend && npm test` → 21 files, **179 tests, all passing** (175 pre-existing + 4 new: unauthenticated-401 on settings, stale/invalid-cookie clearing ×2, no-cookie no-`Set-Cookie`).
- Frontend: `npm run build` succeeds (`tsc -b && vite build`, ✓ built); `npm run lint` → 0 errors (14 pre-existing warnings).
- Live incident replay: `POST /auth/refresh` with the exact stale cookie from the user's DevTools returned **200** after re-login, and failed-refresh responses now clear the dead cookie (A11).
- Cleanup: the throwaway `qa-cycle@test.local` account (user + 2 sessions + 1 activity) created during the refresh diagnosis was deleted from the dev DB; the diagnostic script remains at `backend/src/scripts/debug-sessions.ts` for future session inspection.
- Still open for manual verification: admin Settings page end-to-end (A1), browser session-survival check (A11), CI wiring (A2/A12), and the hygiene items A5–A10.
