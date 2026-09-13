# Feature Report — Problems a Real User Will Hit on the Public Platform

This report looks at Alpha-net (Eniac) purely from the outside: what happens when a genuine employee, supervisor, or admin actually sits down and tries to use the platform. Each item lists the **symptom** the user experiences and, where useful, the underlying cause. Severity: 🔴 blocking / data loss, 🟠 major feature broken, 🟡 confusing or wrong, ⚪ polish.

---

## 1. 🔴 The Employee Portal is effectively broken

### 1.1 New employee logs in and sees… nothing
- Symptom: An employee (role "user" — including supervisors) signs in and the dashboard shows **0 projects, 0.0h this week, no notifications, `-` names everywhere**. My Projects, My Timesheets, Team Timesheets and Approvals are all empty. No error message is shown.
- Cause: The app's initial data load calls the admin-only user directory (`GET /users` → 403) inside an all-or-nothing `Promise.all`, so the **entire** load (projects, timesheets, activities, notifications) is discarded for non-admins.
- Impact: The primary persona — an employee who needs to log hours — cannot use the platform at all. Only admins see a working app.

### 1.2 Even with data present, employee/supervisor pages show `-` for people
- Symptom: Submissions list, Approvals, Project Details ("Project Manager", "Supervisor") show `-` instead of names; reviewer avatars are missing on Submission Details.
- Cause: Employee/supervisor pages resolve people from a user directory the platform never loads for them (it's admin-only, and no non-admin directory endpoint is wired up).

---

## 2. 🔴 Logging hours: silent data loss and traps

These are the problems in the core feature — the weekly timesheet.

### 2.1 "Draft saved" that isn't saved
- Symptom: An employee enters hours and clicks **Save Draft** → green **"Draft saved"** toast. Later (after closing the tab or refreshing) the entries are **gone**.
- Cause: The app shows success without checking whether the server actually accepted the save; server rejections (rule violations, week collisions) are swallowed. The user only discovers the loss when the work matters.

### 2.2 "Timesheet submitted successfully" that wasn't submitted
- Symptom: The employee submits, sees success, navigates away… and the timesheet still shows **draft** in their list. The supervisor never receives it, no approval happens, and payroll misses the week.
- Cause: The submission result is ignored before showing the success toast.

### 2.3 Switching a work item between Regular/Overtime keeps hidden hours
- Symptom: The user types 8h on Saturday, then switches the work item to "Regular". The Saturday box greys out — but the hours are still there. Saving reports success; submitting then throws a wall of concatenated errors like *"Regular entry has hours on sat…; Overtime entry…"* — or the save is silently rejected (see 2.1).
- Cause: Disabling the wrong-day input hides the value instead of clearing it, and the client never validates the platform's own rule (Regular = Mon–Fri only, Overtime = Sat–Sun only).

### 2.4 The week arrows silently *relocate* the timesheet
- Symptom: A user opens last week's timesheet to look at it, taps ‹ to peek further back, then hits Save Draft. Their week's entries have now **moved to the other week** — hours reports shift, an "already exists for this project and week" conflict can occur, and the original week's data is overwritten without any warning.
- Cause: The ‹ › arrows change the **open timesheet's week** rather than navigating between weeks, and Save commits the move.

### 2.5 You can only *create* a timesheet for the current week
- Symptom: An employee who missed last week's timesheet goes to My Timesheets → **New Timesheet** — the picker offers only this week. To fix last week they must create this week's timesheet and then use the week arrows trick (2.4), which is exactly the trap described above.
- Inconsistency: the list page says "current week only"; the editor allows any past week. Users can't predict which behavior applies.

### 2.6 "This Week" on the dashboard is wrong if you work on multiple projects
- Symptom: An employee logs 20h on Project A and 15h on Project B this week. The dashboard shows **"This Week: 20.0h"** (one timesheet only) and clicking it opens an arbitrary one of the two.
- **Status:** Fixed. The card now sums `totalHours` across **all** current-week timesheets (regular/overtime/total), shows the project count, and deep-links to the My Timesheets list instead of one arbitrary timesheet.

### 2.7 The timesheet entry model is unnecessarily strict
- Symptom: Regular entries *must* be Mon–Fri, overtime *must* be Sat–Sun. A user who worked Saturday as a regular shift, or needs weekday overtime, simply can't record it — and nothing in the UI explains the rule; the wrong days are just quietly disabled.

---

## 3. 🟠 Approvals: supervisors see buttons that don't work

### 3.1 Approve/Decline that always fail
- Symptom: A supervisor opens a pending timesheet, sees working **Approve** / **Decline** buttons, confirms… and gets a red `[FORBIDDEN] Review access denied to this timesheet` toast. Retry → same failure.
- Cause: The web app's rules for who may review differ from the API's rules (the app offers review to a supervisor-of-the-employee or team-member-of-the-project; the API only allows the project's designated supervisor or an admin).

### 3.2 Supervisors can approve their own timesheets
- Symptom: A supervisor who works on a project they supervise submits their own timesheet and then approves it themselves. No warning, no separation of duties.

### 3.3 Declining requires a reason but the dialog doesn't enforce one
- Symptom: A reviewer taps Decline without a reason and gets `[VALIDATION_ERROR] Reason is required` only after submitting — no inline hint that a reason is mandatory.

---

## 4. 🟠 Documents: upload them and they vanish

### 4.1 Files disappear after reload
- Symptom: An admin creates a project and attaches documents → success. Later, Project Details shows **"No documents have been uploaded for this project."** The files are on the server but the app never lists them.
- Cause: The app's document store is initialized with a call that returns an empty list by construction. Everything is invisible until the app happens to re-list them manually.

### 4.2 Downloads don't work
- Symptom: Clicking the download icon on Project Details does nothing useful — a broken/failed request. On the employee's Project Details there is **no download at all**, and the "Export" button does nothing when clicked.
- Cause: The app links to the storage provider's *private* URLs instead of the platform's authenticated download endpoint, which exists but is unused.

### 4.3 You can't upload to an existing project
- Symptom: The only place files can be attached is project **creation**. There is no upload button anywhere on Project Details — despite the API fully supporting uploads to existing projects.

---

## 5. 🟠 Account & security features users expect are missing

### 5.1 "Forgot password?" goes nowhere
- Symptom: Clicking it does nothing — it's a dead button. Even the backend endpoint it would call is not implemented (`501`). A user who forgets their password must contact an admin to have it reset manually.

### 5.2 No password change, ever
- Symptom: Nowhere in the platform can a user change their own password — not in Settings, not via reset. Admin-created passwords last forever (until an admin manually edits the user).

### 5.3 Settings that pretend to work
- Symptom (employee): An employee edits their **Name** and **Email** in Settings, hits Save → "Settings saved successfully". Reload: name/email unchanged. The edits are silently thrown away.
- Symptom (employee): Notification preference switches (Submission/Deadline/Approval) save "successfully" but have **no effect** — the platform keeps sending every notification type.
- Symptom (employee): The **Dark Mode** toggle saves but changes nothing — the app has no dark theme.
- Symptom (admin): The admin's Company Settings (timezone, weekly start day, workdays, standard weekly hours, weekend-overtime rule, all notification toggles, logo) save "successfully" but **none of them change platform behavior**. Weeks are always Monday-start, Regular/Overtime day rules are always hardcoded, the weekly target on timesheets is always 40h, and all notifications always fire — regardless of what the admin configures.

### 5.4 "Remember me" is a checkbox that remembers nothing
- Symptom: Tick Remember me, sign in, close the browser, come back — you're still signed in (cookie-based refresh), but the checkbox itself has no effect either way. It's cosmetic.

### 5.5 Admin guardrails discovered the hard way
- Symptom: An admin tries to deactivate themselves or demote the last admin — the platform refuses **after** the fact with a terse error toast, and in some flows still shows "User deactivated successfully" even when nothing happened. Deactivating a user also has **no confirmation dialog** — one misclick in the dropdown is irreversible from the UI (an admin can re-activate, but sessions and access are cut instantly).

### 5.6 Demo accounts on the real login screens
- Symptom: The production login pages offer "Demo Admin / Demo User / Demo Supervisor" buttons, and the demo passwords are hardcoded in the app bundle. Anyone who obtains the app (or reads its public repo) can log into any demo deployment.

---

## 6. 🟠 Notifications: noisy, capped, and never live

### 6.1 The bell never updates on its own
- Symptom: A supervisor sits on the approvals page while an employee submits. No badge appears — the notification only shows up after some other action triggers a refresh (or a full page reload). There is no polling or push.

### 6.2 Unread badge stuck at 50
- Symptom: A busy reviewer with 51+ unread notifications shows "50" forever; the "you have 50 unread notifications" line is also wrong.

### 6.3 Clicking a notification leads somewhere vague
- Symptom: Tapping "Your timesheet was approved" goes to the **Submissions list**, not to the timesheet; deadline/project notifications go to the **projects list**, not the project. The user must hunt for the item the notification was about.

### 6.4 Deadline reminders don't fire **[FIXED — 2026-09-11]**
- Symptom: Projects pass their deadlines with no automatic reminder — the scheduled job that should warn managers/supervisors 3 days out can never authenticate (see QA report, C3). Deadlines appear only passively on dashboards.
- **Status:** Fixed. The cron route is now mounted before the JWT middleware, so a scheduler holding only `CRON_SECRET` can authenticate. Mitigates the silent-deadline problem, although the feature only nudges managers/supervisors 3 days before a deadline — employees never get warned themselves (see §6.1).

---

## 7. 🟡 Reports (admin): plausible-looking numbers that are wrong

- **Draft and withdrawn hours count as worked hours.** An employee with a half-filled draft or a withdrawn submission inflates "hours by project/employee" and overtime totals. Reports have no way to exclude them — a real problem if these feed payroll.
  - **Status:** Fixed. `buildMatchStage` now applies a `status` filter when present; the Reports UI defaults to **Approved only** and exposes a "Timesheet status" dropdown (Approved / All statuses / Pending / Declined / Withdrawn / Draft). The filter is threaded through `ReportFilters` → `toQueryString` → the four report endpoints.
- **Filter conflicts:** picking a department silently overrides an employee filter (or vice versa) with no indication.
  - **Status:** Fixed. `userId` and `department` now **intersect** (`$and`) instead of being mutually exclusive branches, so supplying both keeps both constraints. An empty department resolves to an always-false condition rather than silently returning all data.
- **Preset date ranges bucket by week-start** — a timesheet is included if its Monday falls in range, so partial weeks slip in/out unexpectedly.
- **Reports are admin-only.** Supervisors who manage a team have no reporting view at all.

---

## 8. 🟡 Dates, timezones, and locale quirks

- **Week ranges can render shifted by a day.** For users west of UTC (e.g., US timezones), the "Mon Sep 7 – Fri Sep 11" column can display as "Sun Sep 6 – Thu Sep 10". Different pages parse the same date string in different ways; the admin Tables, Submissions, Approvals, and Review panel are all affected.
- **The user dashboard always greets "Good morning"** — even at 11pm (the admin dashboard does this correctly).
- **Everything is US-centric:** USD formatting, en-US dates, no locale support.

## 9. 🟡 Search, filtering, and scale

- **Search is mostly fake or client-side.** Several "search/filter by user/supervisor" service functions send query parameters the backend ignores, and the supervisor's employee/project filters operate only on data that already made it to the browser. With large datasets, results will be incomplete and searches will appear to "not find" things that exist.
- **No pagination on any list.** A company with thousands of timesheets/activities loads them all on login; pages get slower over time and the initial load balloons (6 parallel requests, refetched after every login and most actions).
- **Shared networks get locked out.** In production, all of `/api/v1/auth` (login **and** token refresh) allows only 10 requests/min per IP. An office behind one shared IP — or a user with a few tabs open — hits "Too many requests" during normal use, and the app's single automatic retry usually fails too.
- **Regular expressions in search are not escaped.** Searching for a client named "Acme (2024)" or a name containing `+` breaks the search (server error) rather than returning results.

## 10. 🟡 Session & sign-in behavior

- **Silent re-login on refresh:** the access token lives in memory only, so a page reload briefly shows the loading spinner while the app exchanges the cookie for a new token. Combined with the login rate-limit, an office of users refreshing around a token expiry can trip 429s at sign-in time.
- **Logout can fail silently:** signing out with an expired session may leave the server session and refresh cookie alive for up to 7 days (the client only clears its own memory).
- **Role changes take up to a minute to apply** — a user demoted from supervisor keeps supervisor powers for up to 60s; supervisors won't notice, but admins testing this will.
- **Login screens are split by role** (`/adminlog` vs `/userlog`) but don't enforce role: an admin who signs in through the employee portal is bounced to the admin dashboard, and vice versa — confusing, but harmless.

## 11. 🟡 Admin experience gaps

- **Archived projects vanish from the dashboard's project-status card** (only active/completed/overdue/draft are counted), though they still appear in project lists.
- **No way to upload documents to an existing project** (see 4.3) and no download that works (4.2).
- **Editing a user shows no preview of the consequences:** changing a supervisor won't warn that the supervisee's team views will change; changing roles is blocked for self with a post-hoc error.
- **Settings illusion** (see 5.3): an admin can spend time configuring the company profile with zero effect — arguably worse than not having the page.
- **Company/brand name is fixed at "Eniac"** in the browser title and sidebar regardless of settings.

## 12. ⚪ Polish & trust issues

- **Buttons that do nothing:** "Forgot password?", "Remember me", "Export" on documents, the file-type button on documents (labeled with a MIME subtype like `pdf`), and the supervisor Team Timesheets "Review" button (always dumps you at the top of the Approvals page, losing the row you clicked).
- **Success toasts lie** (see 2.1/2.2) — the single biggest trust-killer: after enough "saved!"-then-gone experiences, users will stop trusting any confirmation in the app.
- **No empty-state guidance for new users:** a brand-new employee (once the data loads) sees "No projects assigned" with a button that just reloads the dashboard — there's no explanation that an admin must assign them.
- **Mobile:** the sidebar works, but tables rely on horizontal scrolling with sticky columns; day-input cells are tiny (64px) and easy to mis-tap; modals aren't keyboard-trapped (Tab escapes behind the dialog) and don't close on Escape.
- **Activity feed is shared:** in the admin UI, activity entries from all users appear; employees with API access can read everyone's feed too (a privacy leak a security reviewer or curious employee could find — see QA C4).
- **Console noise:** failed initial loads produce unhandled promise rejections in the browser console for every non-admin user.

---

## Top 10 fixes, ranked by user impact

1. **Fix the non-admin data load** (§1.1) — the app is unusable for employees/supervisors today.
2. **Stop lying in success toasts; check save/submit results** (§2.1, 2.2) — this is data loss, not just cosmetics.
3. **Make documents list + download work** (§4.1, 4.2) and add upload to existing projects (§4.3).
4. **Fix the week-navigation trap in the timesheet editor** (§2.4) and align create-week rules (§2.5).
5. **Clear hidden hours when switching entry type; validate day rules client-side** (§2.3).
6. **Align approval permissions with the backend and hide buttons that can't work** (§3.1); block self-approval (§3.2).
7. **Fix the deadline cron endpoint** (§6.4).
8. **Make Settings honest:** either wire profile/password/notification preferences to real endpoints or remove the controls (§5.1–5.3).
9. **Sum multi-project hours on the dashboard's "This Week"** (§2.6); fix capped unread badge (§6.2) and notification deep-links (§6.3).
10. **Exclude drafts/declined/withdrawn from reports** (§7) — otherwise the numbers users act on are wrong.

*Cross-reference: technical root causes, file/line references, and backend security findings are in `QA.md` in the repo root.*

---

## Fix-Tracking Checklist

Tick `- [x]` as each user-facing problem is resolved. QA IDs in parentheses point at the root cause in `QA.md` — a fix is done only when the *symptom* is gone from the user's point of view, so verify against this list, not just the code.

### 1. Employee portal (blocking)
- [x] 1.1 Employee/supervisor login shows empty dashboards, lists, and notifications (QA C1) **[FIXED — scoped directory endpoint + allSettled load + failure toast]**
- [x] 1.2 `-` placeholders instead of people's names on employee/supervisor pages (QA H6) **[FIXED by C1 — directory now populates for non-admins]**

### 2. Logging hours (timesheets)
- [x] 2.1 False "Draft saved" → real lost work (QA H1) **[FIXED — 2026-09-12]**
- [x] 2.2 False "Timesheet submitted successfully" → supervisor never receives it (QA H1) **[FIXED — 2026-09-12]**
- [x] 2.3 Hidden hours kept when switching a work item between Regular/Overtime (QA H2) **[FIXED — 2026-09-12]**
- [x] 2.4 Week ‹ › arrows silently move the timesheet to another week (QA H3) **[FIXED — 2026-09-12]**
- [ ] 2.5 Cannot create a timesheet for a past week (modal is current-week-only, editor allows any week)
- [x] 2.6 "This Week" stat ignores multi-project weeks (QA M7) **[FIXED — 2026-09-12]**
- [ ] 2.7 Regular=Mon–Fri / Overtime=Sat–Sun rule not explained anywhere in the UI

### 3. Approvals
- [ ] 3.1 Approve/Decline buttons that always 403 for eligible supervisors (QA H4)
- [ ] 3.2 Supervisors/admins can approve their own timesheets (QA H5)
- [ ] 3.3 Decline requires a reason but nothing indicates that until the server error

### 4. Documents
- [x] 4.1 Uploaded documents vanish from Project Details after a reload (QA C2) **[FIXED — store-level GET /api/v1/documents now returns the visible document set]**
- [ ] 4.2 Downloads broken (private blob URLs); no download on employee view; dead "Export" button (QA H8) **[partial — list fixed by C2; downloads still open]**
- [ ] 4.3 No way to upload a document to an existing project

### 5. Account & security
- [ ] 5.1 "Forgot password?" is a dead button; backend endpoint is a 501 stub (QA M6)
- [ ] 5.2 No self-service password change anywhere (QA M4)
- [ ] 5.3 Employee Settings: name/email edits silently discarded; notification prefs have no effect; dark mode is a no-op (QA M4, M5)
- [ ] 5.4 Admin Settings: timezone/week-start/workdays/weekly-hours/toggles/logo all cosmetic (QA M4)
- [ ] 5.5 "Remember me" checkbox has no effect (QA M6)
- [ ] 5.6 User deactivation: no confirmation dialog + false "deactivated successfully" toast; guardrails surface as post-hoc errors (QA H7, M10)
- [ ] 5.7 Demo accounts/credentials exposed on production login screens

### 6. Notifications
- [ ] 6.1 Bell never updates on its own — no polling/push (QA M11)
- [ ] 6.2 Unread badge stuck at 50 (QA M2)
- [ ] 6.3 Click-through goes to lists, not the related timesheet/project (QA M11)
- [x] 6.4 Deadline reminders never fire (QA C3) **[FIXED]**

### 7. Reports (admin)
- [x] 7.1 Draft/declined/withdrawn hours counted as worked hours (QA M8) **[FIXED — 2026-09-12]**
- [x] 7.2 Department filter silently overrides the employee filter (QA M8) **[FIXED — 2026-09-12]**
- [ ] 7.3 Week-bucketed presets include/exclude partial weeks unpredictably
- [ ] 7.4 No supervisor-facing reports at all

### 8. Dates & locale
- [ ] 8.1 Week ranges render shifted by a day for UTC-negative users (QA M12)
- [ ] 8.2 User dashboard always greets "Good morning", even at night
- [ ] 8.3 US-only formatting (USD, en-US dates, no locale support)

### 9. Search, scale & limits
- [ ] 9.1 "by user/supervisor" filters send params the server ignores; search is client-side only (QA M3)
- [ ] 9.2 No pagination on any list — slow pages as data grows
- [ ] 9.3 10/min auth rate limit locks out shared networks / multi-tab users (QA M14)
- [ ] 9.4 Unescaped regex breaks search for names/clients containing metacharacters (QA M15)

### 10. Sessions & sign-in
- [ ] 10.1 Silent re-login spinner on every page reload (memory-only token) — document or smooth
- [ ] 10.2 Logout with expired session leaves server session + refresh cookie alive (QA M13)
- [ ] 10.3 Role changes take up to 60s to apply (QA M13)
- [ ] 10.4 Login screens don't check role before redirecting (admin on /userlog, etc.)

### 11. Admin experience
- [ ] 11.1 Archived projects missing from the dashboard's project-status card (QA M18)
- [ ] 11.2 No consequence preview when editing users (supervisor change, role change)
- [ ] 11.3 Company/brand name fixed at "Eniac" regardless of settings

### 12. Polish & trust
- [ ] 12.1 Dead buttons: Forgot password?, Remember me, Export, file-type chip, Team-Timesheets Review
- [ ] 12.2 Success toasts that lie about saves/submissions (QA H1)
- [ ] 12.3 New-user empty states give no guidance ("View Dashboard" button that reloads the same page)
- [ ] 12.4 Mobile: modals lack focus trap/Escape, tiny 64px day inputs, horizontal-scroll tables
- [x] 12.5 Activity feed readable org-wide (privacy) (QA C4) **[FIXED — 2026-09-12]**
- [x] 12.6 Console noise: unhandled rejections from failed initial loads (QA C1) **[FIXED by C1 — allSettled + defensive catch]**

### Priority tracker (mirrors "Top 10 fixes" above)
- [x] 1. Non-admin data load (C1) → resolves §1.1, §12.6 **[DONE]**
- [x] 2. Honest save/submit feedback (H1) → resolves §2.1, §2.2, §12.2 **[FIXED — 2026-09-12]**
- [x] 3. Documents list + working download + upload-to-existing (C2, H8) → resolves §4 **[partial — §4.1 done by C2; §4.2 downloads + §4.3 upload-to-existing still open]**
- [x] 4. Week navigation trap + create-for-past-week (H3) → resolves §2.4, §2.5 **[FIXED — 2026-09-12]**
- [x] 5. Day-rule parity + hidden hours (H2) → resolves §2.3, §2.7 **[FIXED — 2026-09-12]**
- [x] 6. Approval permissions + self-review block (H4, H5) → resolves §3 **[FIXED — 2026-09-12]**
- [x] 7. Cron deadline endpoint (C3) → resolves §6.4 **[FIXED]**
- [ ] 8. Honest settings + password flows (M4, M5, M6) → resolves §5.1–5.5
- [ ] 9. Dashboard totals, unread badge, deep-links (M7, M2, M11) → resolves §2.6, §6.2, §6.3 **[partial — §2.6 (M7) done 2026-09-12; §6.2 (M2) and §6.3 (M11) still open]**
- [x] 10. Reports status filter (M8) → resolves §7.1, §7.2 **[FIXED — 2026-09-12]**

### Progress summary
| Section | Items | Fixed |
|---------|-------|-------|
| 1. Employee portal | 2 | 2 |
| 2. Logging hours | 7 | 5 (§2.1, §2.2, §2.3, §2.4, §2.6) |
| 3. Approvals | 3 | 2 (§3.1, §3.2) |
| 4. Documents | 3 | 1 (§4.1) |
| 5. Account & security | 7 | 0 |
| 6. Notifications | 4 | 1 (§6.4) |
| 7. Reports | 4 | 2 (§7.1, §7.2) |
| 8. Dates & locale | 3 | 0 |
| 9. Search, scale & limits | 4 | 0 |
| 10. Sessions & sign-in | 4 | 0 |
| 11. Admin experience | 3 | 0 |
| 12. Polish & trust | 6 | 2 (§12.5, §12.6) |
| **Total** | **50** | **12** |
