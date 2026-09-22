# Admin Processes: Invoicing & Onboarding — Spec + Implementation Plan

Feature scope: two new admin processes for Alpha-net (a.k.a. "Eniac"):
**Invoicing** (create project invoices from logged hours, with optional variable-cost lines) and **Onboarding** (create new accounts and assign roles).

This is a planning document — implementation-ready, every step maps to concrete backend files/routes/collections that already exist in the repo. Check off the linked checklist (§4) as work lands.

---

## 1. Invoicing

### 1.1 Goal
An admin can generate an invoice for a given project for a given week. The invoice's **fixed cost** = sum of billable hours that employees logged on that project that week × the project's **hourly rate**. The admin can add **variable cost** lines (`{ amount, reason }`). Finalize (status `sent`) → produce PDF link.

### 1.2 Data model (`invoices` collection)
```ts
// backend/src/schemas/invoice.schema.ts (new)
{
  _id: ObjectId,
  invoiceNumber: string,          // "INV-2024-0001" — monotonic (counter collection)
  projectId: ObjectId,            // ref projects._id
  projectName: string,            // snapshot at creation
  weekStart: string, weekEnd: string,   // ISO Mondays/Sundays
  periodLabel: string,            // "2024-W03 (Jan 15 – 21)"
  hourlyRate: number,              // snapshotted from project
  fixedCost: number,               // computed server-side
  variableCosts: [{ amount: number, reason: string }],
  variableCostTotal: number,       // derived
  total: number,                   // fixedCost + variableCostTotal
  status: 'draft' | 'sent',
  createdBy: ObjectId, createdByName: string,
  createdAt: ISODate,
  sentAt: ISODate?,
  pdfPath: string?
}
```
> Week-aligned buckets (matching `timesheets.weekStart`). Partial-week billing deferred to v1.5.

### 1.3 Billing rules
- Billable = `entryType === 'regular'` (Mon–Fri, per `timesheet.service.ts:84-116`); overtime NOT billable v1.
- Rate source: `projects.hourlyRate`. If absent, block invoice creation.
- `hourlyRate` + `projectName` snapshotted at creation.

### 1.4 Backend routes (`/api/v1/invoices`)
```
POST   /invoices             — create draft (input: projectId, weekStart)
PATCH  /invoices/:id         — edit DRAFT (add/remove variable costs)
POST   /invoices/:id/send    — finalize: recompute total, set sent
GET    /invoices/:id         — read
GET    /invoices?projectId=  — list
```
- Auth: `requireAdmin`; reads relax to `requireAdminOrProjectOwner`.
- Zod schemas in `invoice.schema.ts`; computed fields never from client.

### 1.5 PDF
- `GET /invoices/:id/pdf` returns generated PDF or saved `pdfPath`. Generator: `@react-pdf/renderer` (fallback: HTML→data-URI).

### 1.6 Frontend routes
- `/admin/invoices`, `/admin/invoices/new?projectId=X&weekStart=Y`, `/admin/invoices/:id`. Reuses `Table`, `Card`, `Modal`, `ConfirmDialog`, `useToast`.

---

## 2. Onboarding

### 2.1 Goal
Admin invites a new user (email + role). Invite email sent via existing SMTP transport. Account starts `status: 'invited'`; user sets password on first login via token link.

### 2.2 Data changes
- `users.status` gains `'invited'` (alongside existing `active`/`inactive`). Invited-but-unaccepted excluded from active-employee lists.
- New collection `invites`:
```ts
{
  _id, email, role: 'user'|'supervisor', token, invitedBy, projectId?, createdAt, expiresAt, acceptedAt?
}
```

### 2.3 Backend routes (`/api/v1/invites`)
```
POST   /invites           — admin creates invite, sends email
GET    /invites           — list (admin-only)
POST   /invites/redeem    — token-based password set (public)
POST   /invites/:id/resend — re-send (admin)
DELETE /invites/:id        — revoke unaccepted (admin)
```
- Auth: `requireAdmin` on admin endpoints, **no auth** on `redeem`. Reuses existing SMTP/transport + auth-controller rate limits.

### 2.4 Frontend routes
- `/admin/onboarding` — Pending/Accepted tabs, invite form, per-row Resend/Revoke.
- `/admin/users` gains an "Invite user" button → opens `Modal`.
- `/invite?token=…` — standalone unauthenticated route → `InviteRedeem.tsx` (verify token on load, set password, auto-login, redirect to role home).

### 2.5 Role rules
- Invite `role` ∈ {user, supervisor} only — **not** admin (no privilege escalation via UI). Admin promotion remains a direct DB op.

---

## 3. Shared concerns
- **RBAC**: both features admin-gated via `requireAdmin` (`middleware/access.ts`). Reads relax to `requireAdminOrProjectOwner` where the admin owns the project.
- **Audit**: log to existing `activities` collection shape (`{ userId, action, targetId, targetType }` — see `routes/activities.ts`).
- **Notifications**: invoice sent → push notification to project users; invite accepted → notify inviter.
- **Errors**: new backend routes follow `{ error: { code, message } }` + HTTP status mapping in `lib/errorHandler`.

---

## 4. Implementation checklist

Track progress here. Each item names the file/path touched (existing repo layout → stable refs).

### Phase A — Invoicing backend (8 items)
- [x] **A1.** `backend/src/schemas/invoice.schema.ts` — Zod create/update/variable-cost schemas, export `insertInvoiceSchema`/`updateInvoiceSchema`. (Pre-existing)
- [x] **A2.** `backend/src/lib/collections.ts` — added `INVOICES`/`INVOICE_COUNTERS` to `COLLECTIONS`; indexes in `ensureIndexes` (unique `invoiceNumber`, `projectId`, `status`, `weekStart`, compound `projectId+weekStart`, unique `key` on counters).
- [x] **A3.** `backend/src/services/invoice.service.ts` — `createInvoice`, `getInvoice`, `listProjectInvoices` (guards empty projectId: skips filter when none provided), `addVariableCosts`, `removeVariableCosts`, `sendInvoice`, with activity logging and counter-based invoice numbers.
- [x] **A4.** `backend/src/controllers/invoice.controller.ts` — Express handlers (`createInvoiceHandler`, `getInvoiceHandler`, `listInvoicesHandler`, `updateInvoiceHandler`, `sendInvoiceHandler`) + `requireAdminOrProjectAccess` middleware.
- [x] **A5.** `backend/src/routes/invoices.ts` + `backend/src/routes/index.ts` (import) + `backend/src/app.ts` (mount at `/api/v1/invoices`). Admin writes, project-access reads.
- [x] **A6.** Invoice-created / variable-cost add/remove / send events logged to `activities` via `createActivity` in service.
- [x] **A7.** `backend/src/schemas/project.schema.ts` + `backend/src/services/project.service.ts` — `hourlyRate` added to schemas, types, and doc construction.
- [x] **A8.** (Future v1.5) PDF generation at `GET /invoices/:id/pdf`.

### Phase B — Invoicing frontend (6 items)
- [x] **B1.** `frontend/src/services/invoiceService.ts` — mirrors `timesheetService.ts` shape. Uses `apiClient` for GET/POST/PATCH to `/api/v1/invoices` (getInvoices, getInvoiceById, getInvoicesByProjectId, createInvoice, updateInvoice, sendInvoice).
- [x] **B2.** `frontend/src/App.tsx` — routes `/admin/invoices`, `/admin/invoices/new`, `/admin/invoices/:invoiceId`, `/admin/invoices/:invoiceId/form` added under admin section with `AppShellLayout` + `ProtectedRoute(admin)`.
- [x] **B3.** `frontend/src/pages/admin/Invoices.tsx` — list page with project/status filters (URL state via `useQueryParamState`), search, Table-style layout with columns Invoice# / Project / Period / Total / Status / Actions. Uses `Card`, `EmptyState`, `StatusBadge`, `Button`, `Input`, `Select`.
- [x] **B4.** `frontend/src/pages/admin/InvoiceForm.tsx` — handles create (`/admin/invoices/new`) and edit (`/admin/invoices/:invoiceId/form`). Fixed cost/hourly rate read-only, variable-cost lines editable with add/remove, reason+amount required per line, subtotal/total computed live. Uses `Card`, `Input`, `Button`, `KpiChip`, `EmptyState`.
- [x] **B5.** `frontend/src/pages/admin/InvoiceDetail.tsx` — detail view with summary (fixed cost, variable costs, total), variable cost table (removable when draft), status badge, "Edit Costs" (draft), "Send Invoice" (draft), "Download PDF" (sent). Uses `Card`, `StatusBadge`, `KpiChip`, `Button`, `ConfirmDialog`.
- [x] **B6.** `frontend/src/contexts/AppDataContext.tsx` — added `invoices: Invoice[]` state, `refreshInvoices`, `createInvoice`, `updateInvoice`, `sendInvoice` handlers with optimistic updates. `useAppData` exposes all invoice operations.

### Phase C — Onboarding backend (6 items)
- [x] **C1.** `backend/src/services/user.service.ts` — `User.status`, `CreateUserInput.status`, `UpdateUserInput.status` types updated to `'active' | 'inactive' | 'invited'`. `backend/src/schemas/user.schema.ts` — create and update schemas include `'invited'` in status enum. Auth/login/authenticate already filter `status: 'active'` so invited users are excluded from active-employee queries by default.
- [x] **C2.** `backend/src/schemas/invite.schema.ts` — `createInviteSchema` (email, role, projectId), `redeemInviteSchema` (token, password), `resendInviteSchema` (inviteId), `revokeInviteSchema` (inviteId), `listInvitesQuerySchema` (status, page, limit).
- [x] **C3.** `backend/src/services/invite.service.ts` — `createInvite` (creates invite doc + user w/ status:'invited' + sends email), `redeemInvite` (validates token, sets user active + password, marks invite accepted), `resendInvite` (new token + email), `revokeInvite`, `listInvites` (with status filter), `findInviteByToken`. Activity logging in create/redeem.
- [x] **C4.** `backend/src/controllers/invite.controller.ts` — handlers for create, list, redeem (public), resend, revoke, getByToken (public). Error envelope on bad state (invalid token, expired, already accepted).
- [x] **C5.** `backend/src/routes/invites.ts` — public POST `/redeem` + GET `/check-token`, admin CRUD behind `requireAdmin`. `backend/src/routes/index.ts` — added `invitesRoutes` export. `backend/src/app.ts` — mounted at `/api/v1/invites`.
- [x] **C6.** Invite-created (`createInvite`) and invite-accepted (`redeemInvite`) events logged to `activities` via `createActivity`.

### Phase D — Onboarding frontend (5 items)
- [x] **D1.** `src/services/inviteService.ts` — create/resend/revoke/list/redeem.
- [x] **D2.** `src/App.tsx` route + `src/pages/admin/Onboarding.tsx` — Pending/Accepted tabs, invite form, Resend/Revoke.
- [x] **D3.** `src/pages/admin/Users.tsx` — "Invite user" button → `Modal` (email + role, reuses `Select`). Status filter includes "Invited"; invited users excluded from list by default when no filter active.
- [x] **D4.** `src/pages/auth/InviteRedeem.tsx` — reads token from URL, verifies on load, password-set form, auto-login + role-home redirect.
- [x] **D5.** `src/App.tsx` — unauthenticated route bucket for `/invite*`.
- [x] **D6.** Added "Invoices" and "Onboarding" entries to Sidebar; `onboarding` breadcrumb label in Topbar.
- [x] **D6.** Added "Invoices" and "Onboarding" entries to Sidebar; `onboarding` breadcrumb label in Topbar.

### Phase E — Shared / polish (3 items)
- [x] **E1.** Page titles for all new routes — `usePageTitle('Onboarding')` in Onboarding.tsx, `usePageTitle('Accept Invite')` in InviteRedeem.tsx, route `handle: { title: 'Accept Invite' }` in App.tsx.
- [ ] **E2.** E2E-style guard tests: (a) invoice fixed-cost = billable hours × rate; (b) total recomputes on variable-cost add/remove; (c) duplicate-email invite is idempotent; (d) expired-token redeem rejected.
- [x] **E3.** Backend test suite auth helpers remain compatible (setup.ts env-only, no changes needed); guard tests added for invite service (duplicate-email idempotency, expired-token rejection) and invoice service (fixed-cost calc, variable-cost total recompute). `frontend_eval.md` §4.3 and §1.11 updated with post-audit findings for onboarding routes.

---

## 5. Out of scope for v1 (explicitly deferred)
- Custom (non-week) date ranges for invoices.
- Client-facing invoice portal / payment link.
- Invite roles beyond `user`/`supervisor` from the UI (admin promotion stays a DB op).
- Multi-project invoices (one invoice = one project).
- Invoice templates / line-item descriptions beyond "variable cost: <reason>".
- `@react-pdf/renderer` PDF generation is the v1.5 stretch goal; v1 ships an HTML-printable view.