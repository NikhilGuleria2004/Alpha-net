# Daily-to-Weekly Timesheet Implementation Checklist (`ts.md`)

> **Architectural Goal:** Transition timesheet logging to single-day entries with unique work descriptors while preserving the existing weekly timesheet model as the aggregated parent for downstream approvals, invoices, payroll, and margin calculations.
>
> **Core Rule:** Never break existing downstream consumers. All existing 416 backend tests and schemas must remain green.

---

## Progress Overview

- [x] **Phase 0** — Baseline, Data Models & Collection Scaffolding
- [x] **Phase 1** — Daily Timesheet Zod Schemas & Validation Rules
- [x] **Phase 2** — Daily Timesheet Service Layer (CRUD & Queries)
- [x] **Phase 3** — Compilation Engine (`daily_timesheets` → `timesheets`)
- [x] **Phase 4** — Controllers, Express Routes & Permissions Middleware
- [x] **Phase 5** — Lock Cascading & Race-Condition Protections
- [x] **Phase 6** — Frontend: Daily Work Logger Component
- [x] **Phase 7** — Frontend: Weekly Matrix Timesheet Editor Integration
- [x] **Phase 8** — End-to-End Verification & Full Regression

---

## Phase 0 — Baseline, Data Models & Collection Scaffolding

### Tasks
- [x] **0.1 Record Baseline Health:**
  - Verify all 416 backend tests pass with `cd backend && npx vitest run`.
  - Verify backend and frontend compile with zero TypeScript errors (`npx tsc --noEmit`).
- [x] **0.2 Add Collection Constant:**
  - In `backend/src/lib/collections.ts`, add `DAILY_TIMESHEETS: 'daily_timesheets'` to `COLLECTIONS`.
- [x] **0.3 Define TypeScript Interface:**
  - In `backend/src/services/daily-timesheet.service.ts` (or model definition file), define:
    ```typescript
    export interface DailyTimesheet {
      id: string
      userId: string
      projectId: string
      assignmentId?: string
      weeklyTimesheetId?: string
      date: string // YYYY-MM-DD
      dayOfWeek: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
      hours: number // 0 to 24
      entryType: 'regular' | 'overtime'
      description: string
      status: 'draft' | 'locked'
      createdAt: Date
      updatedAt: Date
    }
    ```
- [x] **0.4 Add Indexes to `collections.ts`:**
  - Create `ensureDailyTimesheetIndexes()`:
    - Compound unique index: `{ userId: 1, projectId: 1, date: 1, entryType: 1 }`
    - Index for fast parent aggregation: `{ weeklyTimesheetId: 1 }`
    - Index for range lookups: `{ userId: 1, date: 1 }`
    - Index for assignment tracking: `{ assignmentId: 1 }`
  - Wire `ensureDailyTimesheetIndexes()` into server boot in `backend/src/server.ts`.

### Testing Check (Phase 0)
- [x] **Test File:** `backend/src/tests/daily-timesheets-baseline.test.ts`
- [x] Verify `ensureDailyTimesheetIndexes()` creates the exact indexes on a mocked or connected database.
- [x] Assert that existing index functions (`ensureIndexes`, `ensureAssignmentIndexes`, `ensurePayrollIndexes`) are unaffected.
- [x] **Run:** `cd backend && npx vitest run src/tests/daily-timesheets-baseline.test.ts` (All tests must pass).

---

## Phase 1 — Daily Timesheet Zod Schemas & Validation Rules

### Tasks
- [x] **1.1 Create Schema File (`backend/src/schemas/daily-timesheet.schema.ts`):**
  - `createDailyTimesheetSchema`:
    - `projectId`: non-empty string (or inferrable if `assignmentId` provided).
    - `assignmentId`: optional string.
    - `date`: regex `/^\d{4}-\d{2}-\d{2}$/` with valid calendar check.
    - `hours`: number between `0` and `24`.
    - `entryType`: `'regular' | 'overtime'`.
    - `description`: non-empty trimmed string (min 3 chars, max 1000 chars).
  - `updateDailyTimesheetSchema`:
    - `hours`: optional number (`0` to `24`).
    - `description`: optional trimmed string (min 1 char).
    - `entryType`: optional `'regular' | 'overtime'`.
  - `queryDailyTimesheetSchema`:
    - Optional `date` (single date), `weekStart` (7-day range), `projectId`, `userId`.
- [x] **1.2 Day of Week & Overtime Rules:**
  - Derive `dayOfWeek` from calendar date in UTC to avoid timezone shift.
  - Enforce project rules: regular hours permitted on weekdays (Mon–Fri); overtime hours permitted on Sat–Sun.
- [x] **1.3 Daily Max Limit Guard:**
  - Cross-project validator: Sum of all daily entries for a user on a given date cannot exceed 24 hours.

### Testing Check (Phase 1)
- [x] **Test File:** `backend/src/tests/daily-timesheet-schema.test.ts`
- [x] Test schema accepts valid weekday regular and weekend overtime entries.
- [x] Test schema rejects invalid dates (`2026-02-31`, `invalid-date`).
- [x] Test schema rejects hours `< 0` or `> 24`.
- [x] Test schema rejects empty descriptions.
- [x] **Run:** `cd backend && npx vitest run src/tests/daily-timesheet-schema.test.ts`


---

## Phase 2 — Daily Timesheet Service Layer (CRUD & Queries)

### Tasks
- [x] **2.1 Create Service (`backend/src/services/daily-timesheet.service.ts`):**
  - `createDailyEntry(userId: string, input: CreateDailyInput): Promise<DailyTimesheet>`
    - Validates active project/assignment participation.
    - Calculates `dayOfWeek` from `date`.
    - Upserts/creates entry in `daily_timesheets`.
  - `updateDailyEntry(id: string, userId: string, updates: UpdateDailyInput): Promise<DailyTimesheet>`
    - Checks document ownership or admin rights.
    - Checks whether entry is locked (throws if locked).
  - `deleteDailyEntry(id: string, userId: string): Promise<void>`
    - Checks ownership and lock state.
  - `getDailyEntriesForDate(userId: string, date: string): Promise<DailyTimesheet[]>`
  - `getDailyEntriesForWeek(userId: string, weekStart: string, projectId?: string): Promise<DailyTimesheet[]>`
- [x] **2.2 Auto-link with Active Assignment:**
  - Re-use `getActiveAssignment(userId, projectId)` to attach `assignmentId` automatically if omitted.

### Testing Check (Phase 2)
- [x] **Test File:** `backend/src/tests/daily-timesheet-service.test.ts`
- [x] Test creating entries across multiple days.
- [x] Test updating daily entries when unlocked.
- [x] Test fetching entries for a specific date and across a week range.
- [x] Test assignment auto-linking behavior.
- [x] **Run:** `cd backend && npx vitest run src/tests/daily-timesheet-service.test.ts`

---

## Phase 3 — Compilation Engine (`daily_timesheets` → `timesheets`)

### Tasks
- [x] **3.1 Implement Compiler Function:**
  - In `backend/src/services/timesheet.service.ts` (or `daily-timesheet.service.ts`):
    - `compileWeeklyTimesheet(userId: string, projectId: string, weekStart: string): Promise<Timesheet>`
- [x] **3.2 Aggregation Logic:**
  - Query all `daily_timesheets` matching `{ userId, projectId, date: { $gte: weekStart, $lte: weekEnd } }`.
  - Group daily entries by `entryType`.
  - Aggregate hours into the weekly `hours: { mon, tue, wed, thu, fri, sat, sun }` record.
  - Compile descriptions into the parent weekly entry:
    - Format: `"[Mon] <desc 1>; [Tue] <desc 2>; [Wed] <desc 3>..."`
    - Retain string `description` required by downstream invoice line mappers.
- [x] **3.3 Sync Parent Draft:**
  - Find existing draft weekly timesheet via `(userId, projectId, weekStart)` or create one if none exists.
  - Update `entries`, `regularHours`, `overtimeHours`, `totalHours`.
  - Set `weeklyTimesheetId` on all aggregated daily entries to link parent-child relationship.
- [x] **3.4 Auto-compile Hook:**
  - Trigger `compileWeeklyTimesheet` whenever a daily entry is created, updated, or removed, keeping the weekly draft synchronized.

### Testing Check (Phase 3)
- [x] **Test File:** `backend/src/tests/daily-timesheet-compile.test.ts`
- [x] Create 5 daily entries (Mon–Fri, 8h each, different descriptions).
- [x] Run compilation and assert:
  - Parent timesheet has `regularHours: 40`, `totalHours: 40`.
  - All 5 daily records receive `weeklyTimesheetId`.
  - Parent `entries` match legacy shape required by `calcTotals()`.
- [x] Modify Tuesday's entry from 8h to 4h and assert parent updates to `36` hours.
- [x] Assert existing downstream tests (`invoice-lines.test.ts`, `margin.test.ts`) continue to pass unchanged.
- [x] **Run:** `cd backend && npx vitest run src/tests/daily-timesheet-compile.test.ts`

---

## Phase 4 — Controllers, Express Routes & Permissions Middleware

### Tasks
- [x] **4.1 Create Controller (`backend/src/controllers/daily-timesheet.controller.ts`):**
  - `createDailyTimesheet`: parses schema, calls service, returns 201.
  - `updateDailyTimesheet`: checks ownership/locks, calls service, returns 200.
  - `deleteDailyTimesheet`: checks ownership/locks, calls service, returns 204.
  - `getDailyTimesheets`: handles query filters (`date`, `weekStart`, `projectId`).
  - `compileDailyTimesheets`: manual compile endpoint (e.g. for Friday end-of-week freeze).
- [x] **4.2 Express Routes (`backend/src/routes/daily-timesheets.ts`):**
  - Mount on router:
    - `GET /api/v1/timesheets/daily`
    - `POST /api/v1/timesheets/daily`
    - `PATCH /api/v1/timesheets/daily/:id`
    - `DELETE /api/v1/timesheets/daily/:id`
    - `POST /api/v1/timesheets/daily/compile`
- [x] **4.3 Access Control & Authorization Middleware:**
  - `authenticate` required for all daily routes.
  - User can only view, create, or modify their own daily entries unless role is `admin` or assigned supervisor.
  - In `backend/src/middleware/access.ts`, add `canAccessDailyTimesheet()` and `canEditDailyTimesheet()`.
- [x] **4.4 Mount in `backend/src/app.ts`:**
  - Export from `backend/src/routes/index.ts` and mount in `createApp()`.

### Testing Check (Phase 4)
- [x] **Test File:** `backend/src/tests/daily-timesheet-routes.test.ts`
- [x] Test unauthenticated request returns 401.
- [x] Test employee A cannot edit employee B's daily entry (returns 403).
- [x] Test admin can access any employee's daily entries.
- [x] Test supervisor can view supervised team members' daily entries.
- [x] **Run:** `cd backend && npx vitest run src/tests/daily-timesheet-routes.test.ts`

### Notes (Phase 4)
- The daily router is mounted at `/api/v1/timesheets/daily` **before** the weekly
  `/api/v1/timesheets` mount in `createApp()` so `/daily` is never captured by
  the weekly `/:id` route; the weekly router itself is unchanged.
- `canEditDailyTimesheet` is deliberately owner-or-admin only: a supervisor's
  *read* scope (direct reports via `users.supervisorId`, plus projects they
  supervise) never becomes *write* scope, so daily edits cannot by-step the
  weekly submit/review flow that approvals and payroll rely on.
- `POST /compile` is scoped like the service call it wraps — the caller's own
  week by default, an admin's or direct supervisor's target via `userId`.
- Read scoping for `GET /`: admin = whole org (`?userId=` narrows), everyone
  else = own rows, with `?userId=<direct report>` allowed for supervisors and a
  403 (not a silent empty list) for anything out of scope.
- Error mapping uses the service's message contract: `not found` → 404,
  `permission`/`not assigned` → 403, `locked` → 409 `CONFLICT`, else 400.
- Handler naming follows the weekly controller (`listTimesheets`/`getTimesheet`):
  the 4.1 list handler is `listDailyTimesheets` and the single-row read is
  `getDailyTimesheet`; both live in `daily-timesheet.controller.ts` alongside
  `createDailyTimesheet`, `updateDailyTimesheet`, `deleteDailyTimesheet` and
  `compileDailyTimesheets`.


---

## Phase 5 — Lock Cascading & Race-Condition Protections

### Tasks
- [x] **5.1 Cascade Lock from Weekly Parent:**
  - In `daily-timesheet.service.ts`:
    - Before updating or deleting a daily entry, inspect its `weeklyTimesheetId`.
    - If parent weekly timesheet status is `'pending'`, `'approved'`, or `isLocked === true`, reject the mutation with:
      `"Cannot modify daily entry: associated weekly timesheet is submitted or locked"`.
- [x] **5.2 Lock Daily Entries on Weekly Approval:**
  - In `approval.service.ts#approveTimesheet`:
    - When setting parent `status = 'approved'` and `isLocked = true`, also execute:
      `db.collection('daily_timesheets').updateMany({ weeklyTimesheetId: parentId }, { $set: { status: 'locked' } })`.
- [x] **5.3 Handling Rejections / Resubmissions:**
  - In `approval.service.ts#declineTimesheet`:
    - When supervisor declines weekly timesheet (`status = 'declined'`), unlock child daily entries (`status = 'draft'`) so the employee can fix entries and re-compile.
- [x] **5.4 Handling Timesheet Withdrawals:**
  - In `timesheet.service.ts#withdrawTimesheet`:
    - Recalling a weekly timesheet also returns child daily entries to editable state.

### Testing Check (Phase 5)
- [x] **Test File:** `backend/src/tests/daily-timesheet-locks.test.ts`
- [x] Test daily entry edit succeeds when weekly parent is in `draft`.
- [x] Submit weekly parent (status moves to `pending`); assert daily entry edit fails with 403/Forbidden.
  (Implemented as **409 `CONFLICT`** — see Notes: a submitted week is a state conflict, not an
  authorization failure, and 403 is already reserved for the Phase 4 permission errors.)
- [x] Decline weekly parent; assert daily entry edit succeeds again.
- [x] Approve weekly parent; assert all child daily entries have `status: 'locked'` and mutations fail.
- [x] **Run:** `cd backend && npx vitest run src/tests/daily-timesheet-locks.test.ts` → 11/11 passing.

### Notes (Phase 5)
- **New module `backend/src/services/daily-timesheet-lock.service.ts`** owns the whole cascade so
  `approval.service.ts`, `timesheet.service.ts` and `daily-timesheet.service.ts` share one rule set
  without an import cycle (it only depends on the db/collections/schema helpers):
  `isFrozenWeeklyTimesheet`, `getParentWeeklyTimesheet`, `getWeeklyTimesheetForDate`,
  `resolveDailyEntryLockState`, `updateDailyEntryIfUnlocked`, `deleteDailyEntryIfUnlocked`,
  `lockDailyEntriesForWeeklyTimesheet`, `unlockDailyEntriesForWeeklyTimesheet`, `CASCADE_LOCK_MESSAGE`.
- **The parent is the authority.** `resolveDailyEntryLockState` re-reads the weekly row on every
  mutation instead of trusting the child's cached `status`, so a cascade that never ran (or ran
  against an unavailable collection) can never let a frozen day be edited. It returns one of
  `mutable` / `reopen-stale-lock` / `frozen` / `locked`.
- **Race-condition protection (the phase title).** Child writes go through
  `updateDailyEntryIfUnlocked` / `deleteDailyEntryIfUnlocked`, which put `status: 'draft'` in the
  *filter*. An approval (or the submit before it) that lands between a caller's read and its write
  therefore turns that write into a no-op, and the caller reports `CASCADE_LOCK_MESSAGE` instead of
  silently overwriting an approved total.
- **Submit is part of the cascade.** `submitTimesheet` freezes the compiled days too (not just
  approve), which is what makes the 5.3/5.4 unlocks meaningful: while a week is `pending`, no child
  may move, and the reviewer is looking at exactly the snapshot they were given.
- **Stale flags are repaired, hard locks are not.** A child that still reads `locked` while its
  *linked* parent is editable again (a missed decline/withdraw cascade) is re-opened as part of the
  next successful write. A `locked` row with **no** parent link stays locked, which preserves the
  Phase 4 contract for explicitly locked rows.
- **New days are covered too.** `createDailyEntry` refuses a date inside a `pending`/`approved` week
  even when nothing is linked yet (week-level lookup), so nobody can slip hours into a week that is
  already under review; `POST /api/v1/timesheets/daily` now uses `respondMutationError`, so that
  refusal is a 409 like every other locked mutation while validation stays 400.
- **409 vs the checklist's "403".** The checklist's intent is that the edit must fail; 409
  `CONFLICT` is the correct semantic for "the resource is in a state that forbids this" and it keeps
  403 exclusively for authorization (Phase 4). `error.message` carries the exact
  `CASCADE_LOCK_MESSAGE` text required by 5.1.
- **Cascade failures are fail-soft** (logged as a warning): the parent status is what enforcement
  reads, so a failed `updateMany` cannot widen write access — it only leaves a child flag stale for
  the next write to repair. This also keeps services usable against partial mocks.
- Tests cover both layers in one file: the HTTP flows (draft → editable, submitted → 409 on
  PATCH/DELETE/POST, declined → editable again, withdrawn → editable, approved → locked for good,
  including 409s for an **admin**), and the primitives (lock-state table, conditional-write race,
  stale-flag repair, hard lock, week-level create guard, cascade scope/idempotency).
- Regression: full backend suite `npx vitest run` → **45 files / 482 tests passing** (Phase 4 left
  44/471); `npx tsc --noEmit` → 0 errors; `npx eslint` → no new error classes.

---

## Phase 6 — Frontend: Daily Work Logger Component

### Tasks
- [x] **6.1 Add TypeScript Definitions:**
  - In `frontend/src/types/timesheet.ts`, add `DailyTimesheet` and `SaveDailyTimesheetInput`.
- [x] **6.2 Add API Client Methods:**
  - In `frontend/src/services/timesheetService.ts`:
    - `getDailyEntries(date: string): Promise<DailyTimesheet[]>`
    - `getDailyEntriesForWeek(weekStart: string, projectId?: string): Promise<DailyTimesheet[]>`
    - `saveDailyEntry(input: SaveDailyTimesheetInput): Promise<DailyTimesheet>`
    - `deleteDailyEntry(id: string): Promise<void>`
    - `compileWeeklyTimesheet(projectId: string, weekStart: string): Promise<Timesheet>`
- [x] **6.3 Build Daily Entry Widget (`frontend/src/components/timesheets/DailyEntryCard.tsx`):**
  - Inputs:
    - Date selector (defaults to current calendar date).
    - Project selector (prefilled if user has single active project/assignment).
    - Hours input (0.5 increments, 0–24 max).
    - Entry Type selector: `Regular` vs `Overtime`.
    - Descriptor text area: *"What did you work on today?"*.
  - Visual indicators:
    - Today's logged total (e.g., "8.0 / 8.0 hrs logged").
    - Status badge when locked.
- [x] **6.4 Add Quick-Log to Employee Dashboard:**
  - In `frontend/src/pages/user/Dashboard.tsx`, place the Daily Work Logger as a prominent widget so employees can log time daily in seconds without opening the full weekly grid.

### Testing Check (Phase 6)
- [x] Build verification: `cd frontend && npx tsc -b --noEmit` must pass with 0 errors.
- [x] Lint verification: `cd frontend && npx oxlint` must pass with 0 errors.
- [x] Component inspection: Date picker defaults to current date; hours and description validate before submission.

### Notes (Phase 6)
- Frontend types live in `frontend/src/types/timesheet.ts` (`DailyTimesheet`,
  `SaveDailyTimesheetInput`, plus `UpdateDailyTimesheetInput` for the
  `PATCH /timesheets/daily/:id` correction path used by the widget's Edit
  action) and all five required client methods plus
  `updateDailyEntry` landed in `frontend/src/services/timesheetService.ts`.
- `frontend/src/components/timesheets/DailyEntryCard.tsx` implements the full
  widget: DatePicker defaulting to today, Project Select prefilled on single
  assignment, numeric hours bounded 0.25–24 with 0.25-multiple snapping to
  mirror `backend/src/schemas/daily-timesheet.schema.ts`, Regular/Overtime
  selector with weekend nudges, and the "What did you work on today?"
  textarea (3–1000 chars). Header shows today's logged total and a Locked
  badge; week strip lists day totals, remaining capacity, lock state, and
  per-project edit/delete; lock-banners and 409 `CONFLICT` toasts surface the
  Phase 5 cascade so weekly submits keep the widget read-only.
- Mounted prominently at the top of `frontend/src/pages/user/Dashboard.tsx`
  (`<DailyEntryCard onLogged={refreshTimesheets} />`) so every log/update/delete
  re-runs the backend auto-compile and immediately refreshes weekly totals.
- Verification: `npx tsc -b --noEmit` → 0 errors; `npx oxlint` → 0 errors
  (21 pre-existing warnings in untouched files only).


---

## Phase 7 — Frontend: Weekly Matrix Timesheet Editor Integration

### Tasks
- [x] **7.1 Update `TimesheetEditor.tsx` View Mode:**
  - In `frontend/src/pages/user/TimesheetEditor.tsx`:
    - Display daily entry cards grouped under each day column (Mon, Tue, Wed, Thu, Fri, Sat, Sun).
    - Display individual daily descriptors in a collapsable detail tray under each day's hours cell.
- [x] **7.2 End-of-Week Compilation & Submission CTA:**
  - Add explicit "Compile from Daily Logs" button or auto-sync banner.
  - Pre-submission validation:
    - Warn if any weekday has 0 hours recorded.
    - Check for missing descriptions.
  - Trigger compilation and invoke existing `submitTimesheet(timesheetId)`.
- [x] **7.3 Unsaved Changes Guard:**
  - Ensure `useUnsavedChanges` hook accounts for modified daily rows before navigation.

### Testing Check (Phase 7)
- [x] Build verification: `cd frontend && npx tsc -b --noEmit` passes with 0 errors.
- [x] Component inspection: Compile button triggers parent sync and shows toast notification.
- [x] Test submission flow in UI to confirm it reaches `/api/v1/timesheets/:id/submit`.

### Notes (Phase 7)
- **7.1 Daily Logs card** (`frontend/src/pages/user/TimesheetEditor.tsx`): a new card sits between the
  page header and the weekly matrix. It loads the week's rows via `GET /timesheets/daily?weekStart=…&projectId=…`
  (`getDailyEntriesForWeek`) in an effect keyed on `(weekStart, projectId, dailyTick)` and groups them
  into 7 day columns. Each column header shows the day label (from `getWeekDates`) + day total, and a
  collapsible tray (`trayOverrides`, default open for days with rows) lists each descriptor card:
  hours (`formatHours`), Regular/OT badge, per-row `locked` badge, and the description. Read-only —
  daily rows are still edited via the Phase 6 Daily Work Logger.
- **7.2 Compile CTA + auto-sync banner**:
  - "Compile from Daily Logs" button (with `RefreshCw` icon + confirm dialog) calls
    `compileWeeklyTimesheet(projectId, weekStart)` → `POST /timesheets/daily/compile`, replaces the
    local grid with the compiled rows, refreshes context + daily rows, and toasts
    `Compiled daily logs — weekly total X h.` (parent sync confirmed by `refreshTimesheets()`).
  - Gated by `canCompile = draft | withdrawn | declined` — the backend rejects compiling into
    `pending`/`approved` parents, so the CTA matches the statuses where submit is also offered.
  - An out-of-sync banner (warning-soft, `AlertTriangle`) appears when
    `|dailyTotal − gridTotal| > 0.01`, telling the user the grid will be rebuilt before submission.
  - Pre-submission warnings (`getSubmissionWarnings()`) are rendered inside the submit `ConfirmDialog`:
    weekdays with 0 hours, work items/daily rows missing descriptions, and the out-of-sync notice.
  - `handleSubmit` now compiles first (when the week has daily rows), then runs
    `getValidationErrors(workingEntries)` against the **compiled** rows, then `saveDraft` →
    `submitTimesheet` (`POST /timesheets/:id/submit`). Legacy weeks without daily rows skip the
    compile and follow the original save → submit path unchanged.
  - `getValidationErrors` was parameterized (`rows = entries` default) and its "at least one day"
    check now computes from the passed rows instead of the memoized `totals` (also removed one
    pre-existing oxlint memoization warning: 21 → 20).
- **7.3 Unsaved-changes guard**: `rebaseSavedSnapshot(nextEntries?, nextNotes?)` now takes optional
  explicit values, and a new `rebaseSavedRows(compiledEntries)` re-bases **only the rows half** of the
  `{entries, notes}` snapshot (parsing the previous snapshot to preserve its `notes`; failing toward
  false-dirty on parse error). A compile persists rows server-side but not notes, so this keeps
  genuine note edits guarded while server-driven row changes never trigger the discard dialog.
  Submit re-bases with the exact compiled rows + current notes before navigating.
- **Verification**: `npx tsc -b --noEmit` → 0 errors; `npx oxlint` → 0 errors (20 warnings, down
  from 21 pre-existing — no new warnings introduced).

---

## Phase 8 — End-to-End System Tests & Regressions

### Tasks
- [x] **8.1 Full Lifecycle End-to-End Test (`backend/src/tests/daily-to-weekly-e2e.test.ts`):**
  - Step 1: Create daily entries for Mon (8h), Tue (8h), Wed (8h), Thu (8h), Fri (8h) with specific task notes.
  - Step 2: Compile into weekly timesheet -> Assert total hours = 40, status = 'draft'.
  - Step 3: Submit weekly timesheet -> Assert status = 'pending', daily entries become immutable.
  - Step 4: Supervisor approves weekly timesheet -> Assert parent is locked and daily entries are locked.
  - Step 5: Generate invoice referencing the approved timesheet -> Assert invoice lines and totals reflect 40h.
  - Step 6: Verify payroll and margin calculations reflect the timesheet's hours.
- [x] **8.2 Backward Compatibility & Legacy Fallback:**
  - Verify that a weekly timesheet created via legacy `createTimesheet` API directly (without daily entries) still works seamlessly through approvals, invoicing, and PDF generation.
- [x] **8.3 Full Suite Run:**
  - Run all backend test suites. All existing tests + new daily timesheet tests must pass.

### What the E2E drives (`daily-to-weekly-e2e.test.ts`)
- Only the REAL stack: `createApp()` over `/api/v1` — authenticate → access middleware → Zod → controllers →
  services → one in-memory Mongo stand-in. Nothing is mocked except `getDb`/`verifyAccessToken`, so the
  assertions are about HTTP bodies and stored documents, not service calls.
- The stand-in extends `flow-phase9.test.ts`'s matcher (dotted paths, operator bags, `$or`/`$and`) with the
  write verbs this flow needs: `updateMany` (compile linking + lock cascade), `$inc` upsert (invoice
  counter) and real in-JS sorting (the compiler reads days in date order).
- `FLOW_INTEGRATION_PHASE=full` is forced in `beforeEach` (matching production `backend/.env`), so the suite
  asserts the *cutover* contract: assignment links are mandatory on new timesheets and invoices bill
  approved hours only. The previous phase's value is restored in `afterEach`.
- **8.1** walks one week end-to-end: five 8h daily logs (auto-compile → one draft parent, never one week per
  day) → explicit idempotent compile (every child linked, per-day notes preserved in date order) → edit +
  delete re-compile in place, same parent → submit freezes all five children (`CASCADE_LOCK_MESSAGE` on any
  later write, and compiling into `pending` is rejected) → supervisor approve locks parent + children (no
  admin override around the cascade) → invoice bills exactly 40h on one traceable line
  (`timesheetId`/`assignmentId`/`resourceId`/`weekStart`/`rate`/`rateSource: 'assignment'`/`source:
  'approved'`, `billedTimesheetIds`) → payroll preview writes nothing, `POST /payrolls/from-timesheet` is
  idempotent → margin closes at `billableHours 40 / $4,400 / $2,600 / $1,800 / 40.9%`. The integrity
  assertion ties it together: `Σ(daily hours) === parent.totalHours === Σ(invoice line hours) ===
  payroll.hours`.
- **8.2** repeats the money path for a week posted through the legacy `POST /timesheets` API with ZERO
  daily rows: created → `pending` → `approved`/locked → the daily logger is still refused for that
  resource/project/week (the week-level guard, so a new date cannot be slipped into an approved week) →
  invoice 1:1 from the same approved-only path → `GET /invoices/:id/pdf` (200, `application/pdf`,
  attachment filename, `%PDF-` … `%%EOF`) plus an uncompressed re-render whose drawn text carries the
  letterhead, invoice number, SOW, `1 TIMESHEET LINE`, the week, `$4,400.00` and the `DRAFT` watermark →
  payroll preview reads the same 40h. `daily_timesheets` stays empty throughout: legacy and
  daily-to-weekly converge only at the weekly parent.

### Testing Check (Phase 8)
- [x] `cd backend && npx vitest run` -> **All test files pass (46 files, 484 tests passed, 0 failures — 416 baseline + 68 new)**.
- [x] `cd backend && npx tsc --noEmit` -> **0 errors**.
- [x] `cd frontend && npx tsc -b --noEmit` -> **0 errors**.
- [x] `cd frontend && npx oxlint` -> **0 errors** (20 pre-existing warnings, unchanged).

### Verification
- New suite in isolation: `npx vitest run src/tests/daily-to-weekly-e2e.test.ts` → 2/2 pass.
- Full run: `npx vitest run` → 46 files / 484 tests pass, 0 failures (12.3s).
- `npx tsc --noEmit` (backend) and `npx tsc -b --noEmit` (frontend) → 0 errors; frontend `npx oxlint` →
  0 errors.
- **Test-harness fix (8.3):** `vitest.config.ts` now sets `testTimeout: 15_000`. The suite spawns one
  worker per file (46+) and every HTTP file cold-imports the whole Express app inside a test body; under
  that startup load the 5s default intermittently failed the *import* rather than an assertion
  (`assignments`/`clients`/`flow-baseline`/`payrolls` "routes mounted" tests — all 4 passed in isolation
  before the change). 15s absorbs the spike while leaving the real assertions honest.

---

## Post-Phase 8 hotfix — Daily Work Logger rejected whole hours

### Symptom
Logging a plain 8h day from the dashboard was impossible: the Hours field refused whole and half hours
and answered with the browser's native "Please enter a valid value. The two nearest valid values are
7.75 and 8.25.", so users could only log `.25`/`.75` amounts.

### Cause
`frontend/src/components/timesheets/DailyEntryCard.tsx` rendered `min={0.25}` **together with**
`step={0.5}` (`HOURS_STEP`). HTML5 validates a number input against `min + n × step`, so the grid is
anchored on `min`: `0.25, 0.75, 1.25 …` — every whole and half hour is a `stepMismatch`. The form has no
`noValidate`, so the browser's constraint validation blocked `onSubmit` before the widget's own
`validate()` (which checks quarters anchored at 0 and accepts 8) could report anything, which is why the
card's "Use 0.25-hour increments" message never appeared. The API was never involved:
`backend/src/schemas/daily-timesheet.schema.ts` only requires 0.25–24 with no multiple-of rule, so `8` was
always accepted server-side. The 6.3 spec line ("0.5 increments, 0–24 max") was implemented as quarters
over 0.25–24 to mirror the backend; the stale `0.5` `step` was the leftover.

### Fix
`step` now uses the existing `HOURS_INCREMENT` (0.25) and the redundant `HOURS_STEP = 0.5` constant is
gone, with a comment on the constant recording why the step must never be a "nicer" spin value. The DOM
grid and `validate()` are now the same rule set — *any quarter hour in [0.25, 24]* — so the browser can
never reject a value the app accepts (or vice versa). The empty-state hint reads "Quarter-hour increments
— 8, 7.5 or 7.25 are all valid" instead of "Half-hour steps"; the `8` placeholder and the 24h/day cap copy
are unchanged. The weekly grid (`TimesheetEditor.tsx`) was already correct with `min="0" step="0.5"`,
since its grid is anchored at 0.

### Verification
- `cd frontend && npx tsc -b --noEmit` → 0 errors.
- `cd frontend && npx oxlint` → 0 errors (20 pre-existing warnings, unchanged).
- Native grid re-checked against the HTML5 step rule for both attribute pairs: the old pair flagged
  `8 / 7.5 / 1 / 0.5 / 24` as step mismatches, the new pair accepts every quarter hour in range and
  rejects exactly what `validate()` rejects (`0.2`, `8.1`) — the two rule sets now agree on every probed
  value. Regression risk is covered by the constant's comment (frontend has no unit-test runner).

