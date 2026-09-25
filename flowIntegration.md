# Flow Integration — Eniac Staffing Architecture → Alpha-net Platform

> Source: `Eniac_Staffing_Onboarding_Timesheet_Invoice_Architecture.docx` (project root)
> Codebase: `backend/src` | Tracker: `flowIntegration-checklist.md`
> Principle: **additive, backward-compatible, dual-write + backfill.**

## 1. Goal

Make the platform follow the docx flow without breaking existing clients:

```
CLIENT → PO/SOW → RESOURCE → ASSIGNMENT → Onboarding → TIMESHEET → Approval → INVOICE → Payroll → Margin
```

- Existing: `USER → PROJECT(client:string) → TIMESHEET(userId,projectId) → Approval → INVOICE(project totals)`
- Target: `RESOURCE(users+) → CLIENT → PROJECT → ASSIGNMENT(billRate/payRate) → TIMESHEET(assignmentId) → INVOICE_LINE(refs) → PAYROLL + MARGIN`

Missing centerpiece: **Assignment**. Everything else is enrichment + traceability.

## 2. Non-Breaking Rules (every phase must obey)

1. Additive only: new collections/optional fields. Never rename, remove, or require a legacy-optional field.
2. No enum breakage: `timesheets.status=draft|pending|approved|declined|withdrawn`, `invoices.status=draft|sent` stay valid. New states are opt-in (`isLocked`, `paid|void`).
3. Dual-write + dual-read: keep writing legacy field (`projectId`, `teamMemberIds`) and read `new ?? legacy`.
4. Idempotent backfills: `tsx src/scripts/*.ts`, re-runnable, prints created/skipped/errors, never drops data.
5. Frozen contracts: zod schemas gain only `.optional()`; responses add keys alongside old ones.
6. Access extended not replaced: new `canAccessAssignment()`; old checks fall back to project when no assignment.
7. Tests per phase (`vitest`, mocked `getDb`); all existing tests stay green.
8. Indexes additive in `lib/collections.ts#ensureIndexes`; keep unique `(userId,projectId,weekStart)`.

## 3. Current vs Target Gap Map

| Docx | Concept | Current (`backend/src`) | Gap | Strategy |
|---|---|---|---|---|
| §1 | One workflow, stable IDs | `users/projects/timesheets/invoices` exist, disconnected | No `Resource→Assignment→Timesheet→Invoice` lineage | Add `clients`, `assignments`, embedded `invoice.lines`, `payrolls`; FK-link, keep legacy fields |
| §2 | Resource master `E000123` | `user.service.ts:10-24`, `user.schema.ts:9-26`: only name/email/employeeId/department/role/flags | No `resourceType/hireDate/payType/payRate/manager/payroll profile/I-9/W-4` | Optional `resourceType,hireDate,payType,defaultPayRate,employmentStatus,managerId` on user |
| §3 | Assignment `ASG-00125` | `project.service.ts:12-28`: `client:string`, `sowNumber`, `teamMemberIds[]`, one `hourlyRate` | No Assignment; one rate/project; no 2-rates-per-person | New `assignments` collection; dual-write `teamMemberIds`; per-assignment `billRate/payRate` |
| §3 | PO/SOW `SIE-2026-001` | `projects.sowNumber` unique string only | No cap/burn-down | Optional `poCap` + computed `poConsumed/poRemaining` |
| §4 | Timesheet | `timesheet.service.ts:8,30-45`: `userId,projectId,weekStart,entries[]` | `projectId`-only; no lock | Optional `assignmentId,isLocked,lockedAt,adjustmentOf` |
| §4 | Timesheet lines | Embedded `entries[{regular\|overtime,hours mon..sun}]`, regular=Mon–Fri, OT=Sat–Sun | No holiday/date rows | Keep embedded; add `holidayHours` in totals later; no sub-collection yet |
| §5 | Invoice | `invoice.service.ts:163-180` sums ALL statuses, no refs; `draft\|sent` only | Over-billing risk; untraceable | `lines[]+billedTimesheetIds[]+approvedOnly` flag; cut over behind flag |
| §5 | Invoice states | `InvoiceStatus=draft\|sent` (query schema already allows `paid\|void`, never set) | No AR close | Add `paid\|void` terminal; only `draft` mutable |
| §6 | Payroll | Nothing | No payroll | New `payrolls` (single collection, `type:w2\|c2c\|offshore`), calc-first then write |
| §6 | Margin | `report.service.ts` hours only | No `(Bill-Pay)*Hours` | New `margin.service.ts` read-only view; docx fixture `18480-10920=7560, 40.9%` |
| §8 | Relationships | `USER M:N→PROJECT 1:M→TIMESHEET; INVOICE→PROJECT totals` | Model mismatch | Assignment layer; project stays grouping + SOW owner |
| §9 | Resource vs Employee | `role:admin\|user`, no typing | No W2/C2C/India split | Optional `resourceType:w2\|c2c\|offshore\|unknown`; payroll branches on it |

## 4. Target Data Model (deltas in bold)

```
users (+**resourceType,hireDate,payType,defaultPayRate,employmentStatus,managerId**)
clients (**NEW**: _id, name unique, billingAddress?, paymentTerms?, contactEmail?, createdAt, updatedAt)
projects (+**clientId?:ObjectId**, +**poCap?:number**; keep `client:string`, `hourlyRate`)
assignments (**NEW**: _id, resourceId→users, clientId→clients, projectId→projects,

## 5. Phased Plan (stop-the-line: `npm run build && npm test` green before next phase)

### Phase 0 — Baseline & Safety (0.5 day, no behavior change)

1. Record current API shapes via existing tests; add `tests/flow-baseline.test.ts` if missing.
2. Optional flag: `FLOW_INTEGRATION_PHASE` in `lib/env.ts`, default legacy; new paths check flag.
3. Add empty collection constants + index scaffolding behind flag (no writes yet).
4. Files: `lib/env.ts`, `lib/collections.ts`, `tests/flow-baseline.test.ts`.
5. Acceptance: build+tests pass, no route change, `/health` ok.

### Phase 1 — Clients: normalize free-text `project.client` (1 day)

1. `lib/collections.ts`: add `CLIENTS:'clients'` + `{name:1}` unique (normalized lowercase).
2. NEW `schemas/client.schema.ts`: `name` required; `billingAddress/paymentTerms/contactEmail` optional.
3. NEW `services/client.service.ts`: `list/get/getByName/create/update`; `create` upserts by normalized name.
4. NEW `controllers/client.controller.ts` + `routes/clients.ts` (`GET /`, `GET /:id`, `POST /` admin, `PATCH /:id` admin); export in `routes/index.ts`, mount `/api/v1/clients` in `app.ts` behind `authenticate`.
5. Projects: add optional `clientId?:ObjectId` only. `schemas/project.schema.ts` gains `.optional()`; `services/project.service.ts#toProject/create/update` persist it when supplied, keep `client:string` required and in sync (fill `client` from client name when omitted; mismatch → prefer explicit `client`, log warn, never reject legacy callers).
6. NEW `scripts/backfill-clients.ts`: distinct `projects.client` → upsert `clients` → `$set:{clientId}` where missing. Idempotent + dry-run flag.
7. NEW `tests/clients.test.ts`: dedupe, project create with/without `clientId`, legacy create unchanged.
8. Acceptance: legacy `POST /projects` unchanged; `GET /clients` works; backfill logged.

### Phase 2 — Resource Enrichment on `users` (0.5–1 day)

1. `schemas/user.schema.ts` (create+update): add optional `resourceType:enum(w2,c2c,offshore,unknown)`, `hireDate?`, `payType:enum(hourly,salary,contract)?`, `defaultPayRate?:number>=0`, `employmentStatus?`, `managerId?`. No new required fields.
2. `services/user.service.ts`: extend `User/CreateUserInput/UpdateUserInput` + `toUser()` passthrough (`?? undefined`); `managerId` as `ObjectId|null`, validated only when supplied.
3. No route changes (existing `usersRoutes` picks it up).
4. Backfill: none required (missing = `unknown` via `doc.resourceType ?? 'unknown'`). Optional `scripts/backfill-resources.ts`.
5. NEW `tests/users-resource.test.ts`: legacy create ok; new fields persisted; bad `resourceType` rejected; never leaks `passwordHash`.
6. Acceptance: `users-create`, `users-directory` tests pass unmodified.

  poSow?, startDate, endDate, billRate, payRate, billingType:hourly|fixed|monthly,

### Phase 3 — Assignments Core (2–3 days, centerpiece)

1. `lib/collections.ts`: add `ASSIGNMENTS:'assignments'` + indexes (§4).
2. NEW `schemas/assignment.schema.ts`: `resourceId,projectId` required; `clientId?,poSow?,approverId?,billingEntity?` optional; `startDate,endDate,billRate>=0,payRate>=0` required; `billingType:hourly|fixed|monthly` default hourly; `timesheetRequired/approvalRequired` default true; `status:active|onHold|completed|terminated` default active.
3. NEW `services/assignment.service.ts`: `list/get/create/update/terminate`, `getActiveAssignment(resourceId,projectId)`, `resolveAssignmentForTimesheet()`. Validate resource+project; `start<=end`; `clientId` omitted → inherit `project.clientId` or upsert from `project.client` (never fail legacy). Dual-write: active `create` → `$addToSet:{teamMemberIds:resourceId}` on project. `terminate` does NOT auto-pull `teamMemberIds`.
4. NEW `controllers/assignment.controller.ts` + `routes/assignments.ts`: `GET /?resourceId=&projectId=&clientId=&status=`, `GET /:id`, `POST /` admin, `PATCH /:id` admin, `POST /:id/terminate` admin. Mount `/api/v1/assignments`.
5. `middleware/access.ts`: add `canAccessAssignment()` (admin→true; owner→true; supervisor/approver→true). Project checks gain OR with assignment, never narrower.
6. NEW `scripts/backfill-assignments.ts`: per project × `teamMemberIds` create `{resourceId,projectId,clientId,billRate:project.hourlyRate??0,payRate:user.defaultPayRate??0,startDate:project.startDate,endDate:project.endDate,status:active}` only if no active pair exists. Idempotent.
7. NEW `tests/assignments.test.ts`: create, dual-write, backfill idempotent, access rules.
8. Acceptance: no existing test modified; 1 active assignment per legacy membership; `GET /projects` unchanged.

### Phase 4 — Timesheet→Assignment Link + Locking (1–2 days)

1. `schemas/timesheet.schema.ts`: `create`+`update` gain optional `assignmentId?:string`.
2. `services/timesheet.service.ts`: interface + `toTimesheet()` gain `assignmentId?,isLocked?,lockedAt?,adjustmentOf?`.
3. `createTimesheet`: if `assignmentId` given → validate (exists, `resourceId==authUser`, project matches or infer `projectId`, active, date in range). If omitted → legacy path + best-effort auto-attach via `getActiveAssignment(userId,projectId)`; never reject when none found.
4. `update/submit/withdraw`: first guard `if (doc.isLocked) throw 'Timesheet is locked'`; `assignmentId` immutable after create (like `weekStart` rule `timesheet.service.ts:237-245`).
5. `approval.service.ts#approveTimesheet`: fold `$set:{isLocked:true,lockedAt:now}` into approve update (atomic). New timesheet may carry `adjustmentOf:<lockedId>`.
6. `createWeeklyDrafts()`: best-effort `assignmentId` per member. Keep unique `(userId,projectId,weekStart)`; add non-unique `{assignmentId:1}` only.
7. `controllers/timesheet.controller.ts#listTimesheets`: accept `assignmentId` filter (additive).
8. NEW `scripts/backfill-timesheet-assignments.ts`: missing `assignmentId` ← active `(userId,projectId)` (earliest `startDate` on multiples; skip+log when none). Idempotent.
9. NEW `tests/timesheet-assignments.test.ts`: auto-attach, explicit validation, locked blocks edit/submit, adjustment allowed.
10. Acceptance: `timesheet-week-move`, `timesheet-weekly-drafts` pass; approved → `isLocked:true`; no client forced to send `assignmentId`.

  timesheetRequired, approvalRequired, approverId?, billingEntity?, status:active|onHold|completed|terminated)
timesheets (+**assignmentId?,isLocked?,lockedAt?,adjustmentOf?**; keep userId,projectId,weekStart)
invoices (+**lines:[{assignmentId,timesheetId,resourceId,hours,billRate,amount}]**,

### Phase 5 — Invoice Traceability + Approved-Only + States (2 days, flag-gated)

Riskiest phase: `createInvoice` today sums ALL statuses (`invoice.service.ts:163-180`) with no lineage.

1. `schemas/invoice.schema.ts`: add optional `assignmentId?`, `timesheetIds?:string[]`, `approvedOnly?:boolean` (default false until cutover). Keep `projectId,weekStart,hourlyRate`.
2. `services/invoice.service.ts`: `Invoice`+`toInvoice()` gain `lines:InvoiceLine[]`, `billedTimesheetIds:string[]`, `approvedOnly:boolean`; keep totals.
3. NEW `collectBillableTimesheets(projectId,opts)`: `{projectId,status:'approved',_id:{$nin:alreadyBilled}}` where `alreadyBilled` = union of non-void invoices' `billedTimesheetIds`; intersect assignment/timesheet filter when given. Same Mon–Fri regular rule; snapshot `billRate=assignment.billRate ?? invoice.hourlyRate`.
4. `createInvoice`: flag branch — legacy (sum all, no lines, totals unchanged) default until sign-off; new path writes `lines[]+billedTimesheetIds[]` from approved only; `0 billable → 400 'No approved unbilled hours'`. Keep one-open-draft guard (`invoice.service.ts:195-202`).
5. Mutations (`updateInvoiceRate/addVariableCosts/removeVariableCosts/sendInvoice`, guards at `invoice.service.ts:282,339,380,439`): extend `status!=='draft'` to also block `paid|void`. NEW `markInvoicePaid/invoiceVoid` + `POST /invoices/:id/pay`, `POST /invoices/:id/void` (admin). `void` releases reservation; `paid` terminal. `InvoiceStatus` → `'draft'|'sent'|'paid'|'void'` (`invoice.service.ts:12`).
6. Cutover: deploy `approvedOnly=false` + best-effort lines → `scripts/backfill-invoice-lines.ts` (reconstruct lines proportionally, `approvedOnly:false`, NEVER change totals) → verify → flip default `approvedOnly=true` → monitor.
7. `invoice-pdf.service.ts`: lines table when `lines.length>0`, else legacy totals.
8. NEW `tests/invoice-lines.test.ts`: approved-only excludes draft/pending/declined; double-bill blocked; void releases; paid terminal; legacy path works when flag off.
9. Acceptance: open drafts' totals unchanged until flip; new invoices trace `lines[].timesheetId→timesheets._id (approved,locked)`; `paid|void` end-to-end.

### Phase 6 — Payroll / Vendor Payments, read-first (2 days, NEW domain)

1. `lib/collections.ts`: add `PAYROLLS:'payrolls'` + indexes (§4). Single collection, `type:w2|c2c|offshore`.
2. NEW `schemas/payroll.schema.ts`: query `resourceId/assignmentId/status/from/to`; create `timesheetId` required (admin).
3. NEW `services/payroll.service.ts`: `previewPayroll(timesheetId)` pure calc (no write): `{hours,payRate:assignment.payRate ?? user.defaultPayRate,grossPay,type}`. `createPayrollFromTimesheet(timesheetId,adminId)`: require `approved`, idempotent on `timesheetId`, write `{resourceId,assignmentId,timesheetId,hours,payRate,grossPay,type,status:'draft'}`. Surface `payRateMissing:true` when 0/unset.
4. NEW `controllers/payroll.controller.ts` + `routes/payrolls.ts`: `GET /` admin+filter, `GET /preview?timesheetId=` admin, `POST /from-timesheet` admin, `POST /:id/pay`, `POST /:id/void` admin. Mount `/api/v1/payrolls`.
5. No backfill (new domain). Optional `scripts/preview-payroll.ts` dry-run.
6. NEW `tests/payrolls.test.ts`: preview math (`168h*$65=$10,920`), approval gate, idempotent create, W2 vs C2C branch.
7. Acceptance: invoicing untouched; previews match docx §6.

### Phase 7 — Margin View (0.5 day, no money stored)

1. NEW `services/margin.service.ts`: `getMargin({projectId?,assignmentId?,from?,to?})` over approved timesheets + assignments + invoice lines → `{billableHours,billedAmount,payrollCost,grossMargin,marginPct}`; `margin=(billRate-payRate)*hours`.
2. `routes/reports.ts`: `GET /reports/margin?...` reusing `buildMatchStage` default `approved` (`report.service.ts:56-97`).
3. NEW `tests/margin.test.ts`: docx fixture `18480-10920=7560, 40.9%`.

### Phase 8 — Onboarding Docs, PO Balance, Polish (1 day)

1. Documents: add optional `userId,kind:i9|w4|offer|other` to `documents` (schema+service+`{userId:1}` index); keep `projectId` for project docs; `GET /documents?userId=` for onboarding checklist.
2. PO/SOW: `GET /projects/:id` gains computed `poCap,poConsumed(sent+paid totals),poRemaining` (computed, not stored).
3. Assignment lifecycle: `POST /assignments/cron/rollover` (CRON_SECRET, mirrors timesheet cron) marks `completed` past `endDate` — manual first, cron later.
4. Docs: map `Draft→Submitted(pending)→Rejected(declined)→Resubmitted→Approved→Locked` without renaming enums; expose `isLocked` in responses.

### Phase 9 — Cutover & Done (0.5 day)

1. Flip `approvedOnly` default → true; require `assignmentId` on NEW timesheets only after 100% backfill.
2. Keep legacy fields ≥2 releases before any deprecation notice.
3. Edge testing: duplicate backfills, concurrent invoice creates, large `teamMemberIds`.

  +**billedTimesheetIds:ObjectId[]**, +**approvedOnly:boolean**, status +**paid|void**; keep totals)
payrolls (**NEW**: _id, resourceId, assignmentId, timesheetId unique, periodStart/End,
  hours, payRate, grossPay, type:w2|c2c|offshore, status:draft|paid|void)
```

Additive indexes in `lib/collections.ts#ensureIndexes`:
`clients{name unique}`, `assignments{resourceId,projectId,clientId,status,resourceId+projectId+status}`,
`timesheets{assignmentId}`, `invoices{billedTimesheetIds}`, `payrolls{resourceId,assignmentId,timesheetId,status}`.

## 6. File Touch List

| File | Change | Phase |
|---|---|---|
| `backend/src/lib/collections.ts` | Add `CLIENTS,ASSIGNMENTS,PAYROLLS` + indexes | 0,1,3,6 |
| `backend/src/lib/env.ts` | Optional `FLOW_INTEGRATION_PHASE` flag | 0 |
| `backend/src/schemas/client.schema.ts` | NEW | 1 |
| `backend/src/services/client.service.ts` | NEW (upsert by name) | 1 |
| `backend/src/controllers/client.controller.ts` | NEW | 1 |
| `backend/src/routes/clients.ts`, `index.ts`, `app.ts` | NEW + mount `/api/v1/clients` | 1 |
| `backend/src/scripts/backfill-clients.ts` | NEW idempotent | 1 |
| `backend/src/schemas/user.schema.ts`, `services/user.service.ts` | Optional resource fields | 2 |
| `backend/src/schemas/assignment.schema.ts` | NEW | 3 |
| `backend/src/services/assignment.service.ts` | NEW + dual-write `teamMemberIds` | 3 |
| `backend/src/controllers/assignment.controller.ts`, `routes/assignments.ts` | NEW + mount | 3 |
| `backend/src/middleware/access.ts` | `canAccessAssignment`, OR with project | 3,4 |
| `backend/src/scripts/backfill-assignments.ts` | NEW idempotent | 3 |
| `backend/src/schemas/timesheet.schema.ts` | `+assignmentId?` | 4 |
| `backend/src/services/timesheet.service.ts` | Auto-attach, immutability, `isLocked` | 4 |
| `backend/src/services/approval.service.ts` | Set `isLocked` on approve | 4 |
| `backend/src/controllers/timesheet.controller.ts` | `assignmentId` filter | 4 |
| `backend/src/scripts/backfill-timesheet-assignments.ts` | NEW idempotent | 4 |
| `backend/src/schemas/invoice.schema.ts` | `+assignmentId?,timesheetIds?,approvedOnly?`; status `paid\|void` | 5 |
| `backend/src/services/invoice.service.ts` | `lines[],billedTimesheetIds[]`, approved-only, `pay/void` | 5 |
| `backend/src/services/invoice-pdf.service.ts` | Lines table when present | 5 |
| `backend/src/controllers/invoice.controller.ts`, `routes/invoices.ts` | `POST /:id/pay`, `POST /:id/void` | 5 |
| `backend/src/scripts/backfill-invoice-lines.ts` | NEW, totals-preserving | 5 |
| `backend/src/schemas/payroll.schema.ts`, `services/payroll.service.ts`, `controllers/payroll.controller.ts`, `routes/payrolls.ts` | NEW domain | 6 |
| `backend/src/services/margin.service.ts`, `routes/reports.ts` | `GET /reports/margin` | 7 |
| `backend/src/services/document.service.ts` | `+userId?,kind?` | 8 |
| `backend/src/tests/*.test.ts` | New per-phase; modify none existing | all |

## 7. API Deltas (all additive)

```
POST /api/v1/clients (admin) | GET /clients | GET /clients/:id | PATCH /clients/:id
POST /api/v1/assignments (admin) | GET /assignments?resourceId=&projectId=&status= | GET /assignments/:id | PATCH /assignments/:id | POST /assignments/:id/terminate
GET  /api/v1/timesheets?assignmentId= (existing + filter)
POST /api/v1/invoices/:id/pay (admin) | POST /api/v1/invoices/:id/void (admin)
POST /api/v1/payrolls/from-timesheet (admin) | GET /payrolls?resourceId=&status= | GET /payrolls/preview?timesheetId= | POST /payrolls/:id/pay | POST /payrolls/:id/void
GET  /api/v1/reports/margin?projectId=&assignmentId=&from=&to=
```

No existing route removed or re-typed. New keys (`assignmentId,isLocked,lines,billedTimesheetIds,clientId,margin`) sit alongside legacy keys.

## 8. Rollback & Risks

- Rollback per phase = flag off / stop calling new endpoints; legacy fields were always written.
- Phase 5 is highest risk (money): flag + totals-preserving backfill + `alreadyBilled` guard + one-draft guard retained.
- Never silently compute on `payRate=0`: surface `payRateMissing:true` until corrected.
- `sowNumber` unique stays; `clients.name` unique on normalized lowercase (`Sony` vs `sony`).
- Locking via `isLocked` boolean, not new `status`, so status queries/reports/UI keep working.

## 9. Definition of Done

- [ ] `npm run build && npm test` green after every phase (see checklist).
- [ ] Legacy clients (no new fields) get equivalent behavior on users/projects/timesheets/invoices.
- [ ] New collections have indexes + idempotent backfill + tests.
- [ ] New invoices trace `lines[].timesheetId → timesheets._id (approved,locked)`; void releases, double-bill blocked.
- [ ] Payroll preview matches docx math; margin matches `7560 / 40.9%` on fixture.
- [ ] `flowIntegration-checklist.md` fully checked with evidence (test names, script logs).


