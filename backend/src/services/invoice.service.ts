import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import { getProjectById } from './project.service.js'
import { normalizeToMonday } from './timesheet.service.js'
import { sendInvoiceEmail } from '../lib/email.js'
import { buildInvoicePdf } from './invoice-pdf.service.js'
import { getFlowIntegrationPhase } from '../lib/env.js'
import type { VariableCostInput } from '../schemas/invoice.schema.js'

/**
 * Flow Integration Phase 5: `paid` and `void` join the lifecycle. `paid` is
 * terminal (money received); `void` cancels the invoice AND releases the
 * timesheets it reserved, so they become billable again on the next invoice.
 */
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'

export interface VariableCost {
  id: string
  amount: number
  reason: string
}

/**
 * Flow Integration Phase 5 — one billed timesheet. `amount = round2(hours ×
 * rate)` per line, so `sum(lines.amount)` equals the invoice's fixedCost to the
 * cent (the approved-only path sums these lines to build fixedCost; the
 * backfill allocates proportionally and pushes any rounding remainder onto the
 * largest line).
 */
export interface InvoiceLine {
  timesheetId: string
  assignmentId?: string
  resourceId?: string
  resourceName?: string
  weekStart: string
  /** Billable regular Mon–Fri hours of that timesheet. */
  hours: number
  /** Rate applied to this line (assignment billRate when usable, else the invoice rate). */
  rate: number
  amount: number
  /**
   * 'assignment' when the linked assignment supplied a usable (>0) billRate,
   * 'invoice' when the invoice's hourlyRate was used. Never silently 0: a
   * backfilled assignment carries `billRate: 0`, which is treated as unset.
   */
  rateSource: 'assignment' | 'invoice' | 'manual'
  /** 'approved' = forward approved-only path; 'proportional' = backfill reconstruction. */
  source: 'approved' | 'proportional'
}

export interface Invoice {
  id: string
  invoiceNumber: string
  projectId: string
  projectName: string
  weekStart: string
  weekEnd: string
  periodLabel: string
  hourlyRate: number
  billableHours?: number
  fixedCost: number
  variableCosts: VariableCost[]
  variableCostTotal: number
  total: number
  status: InvoiceStatus
  createdBy: string
  createdByName: string
  createdAt: Date
  updatedAt: Date
  sentAt?: Date
  pdfPath?: string
  // ─── Flow Integration Phase 5 (optional so legacy constructors keep
  // compiling; toInvoice() always populates them) ───────────────────────────
  /** Per-timesheet traceability; empty on legacy invoices and on flag-off invoices. */
  lines?: InvoiceLine[]
  /** The timesheets this invoice reserved — the double-bill guard reads these. */
  billedTimesheetIds?: string[]
  /** True ⇒ lines/billedTimesheetIds came from the approved-only path. */
  approvedOnly?: boolean
  /** Billing scope the caller asked for (approved-only path). */
  assignmentId?: string
  paidAt?: Date
  voidedAt?: Date
  voidReason?: string
}

/** Rounds money to cents — every amount stored/compared goes through this. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Flow Integration Phase 8 (§5, item 2) — live PO/SOW balance for a project.
 * `poConsumed` sums invoice `total`s in billable statuses only (sent + paid):
 * drafts are not yet committed and voids were cancelled, so counting either
 * would misstate the PO. `poRemaining` is the cap minus that spend (null when
 * no cap is set, negative when over-billed). Both are computed per request
 * from the invoice ledger and never persisted, so they cannot drift.
 */
export async function getProjectPoBalance(
  projectId: string,
  poCap: number | null,
): Promise<{ poConsumed: number; poRemaining: number | null }> {
  const db = await getDb()
  const invoices = await db
    .collection(COLLECTIONS.INVOICES)
    .find({ projectId: new ObjectId(projectId), status: { $in: ['sent', 'paid'] } })
    .toArray()
  const poConsumed = round2(invoices.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0))
  return {
    poConsumed,
    poRemaining: poCap === null || poCap === undefined ? null : round2(poCap - poConsumed),
  }
}

/** Billable = regular (not overtime) Mon–Fri hours, the same rule as legacy. */
const BILLABLE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const

function billableHoursOf(timesheet: any): number {
  let hours = 0
  for (const entry of timesheet.entries ?? []) {
    if (entry.entryType === 'regular') {
      for (const day of BILLABLE_DAYS) {
        hours += (entry.hours?.[day] as number) ?? 0
      }
    }
  }
  return hours
}

function weekEndFromStart(weekStart: string): string {
  const date = new Date(weekStart + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 6)
  return date.toISOString().split('T')[0]
}

function buildPeriodLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const monthDay = (d: Date) =>
    d.toLocaleDateString('en-US', opts).replace(',', '')
  const year = start.getUTCFullYear()
  const weekNum = Math.ceil(
    (start.getUTCDate() + 6 - start.getUTCDay()) / 7,
  )
  return `${year}-W${String(weekNum).padStart(2, '0')} (${monthDay(start)} – ${monthDay(end)})`
}

/**
 * Label for a project-total invoice: the span between the first and last
 * logged week, e.g. "All logged time · Jan 6 – Mar 21, 2025". Falls back to
 * the week label when the span is a single week.
 */
function buildSpanPeriodLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(weekEnd + 'T00:00:00Z')
  const monthDay = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(',', '')
  if (weekEndFromStart(weekStart) === weekEnd) {
    return buildPeriodLabel(weekStart)
  }
  return `All logged time · ${monthDay(start)} – ${monthDay(end)}, ${end.getUTCFullYear()}`
}

/** Current week's Monday (UTC) — fallback billing period for projects with no timesheets. */
function currentMonday(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
  now.setUTCDate(diff)
  now.setUTCHours(0, 0, 0, 0)
  return now.toISOString().split('T')[0]
}

async function nextInvoiceNumber(): Promise<string> {
  const db = await getDb()
  const result = await db
    .collection(COLLECTIONS.INVOICE_COUNTERS)
    .findOneAndUpdate(
      { key: 'invoice' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
  const seq = result?.seq ?? 1
  const year = new Date().getUTCFullYear()
  return `INV-${year}-${String(seq).padStart(4, '0')}`
}

function toInvoice(doc: any): Invoice {
  const variableCosts: VariableCost[] = (doc.variableCosts ?? []).map(
    (vc: any) => ({
      id: vc._id?.toString() ?? vc.id ?? '',
      amount: vc.amount,
      reason: vc.reason,
    }),
  )
  const variableCostTotal = variableCosts.reduce((sum, vc) => sum + vc.amount, 0)
  return {
    id: doc._id.toString(),
    invoiceNumber: doc.invoiceNumber,
    projectId: doc.projectId.toString(),
    projectName: doc.projectName,
    weekStart: doc.weekStart,
    weekEnd: doc.weekEnd,
    periodLabel: doc.periodLabel,
    hourlyRate: doc.hourlyRate,
    billableHours: doc.billableHours,
    fixedCost: doc.fixedCost,
    variableCosts,
    variableCostTotal: doc.variableCostTotal ?? variableCostTotal,
    total: doc.total,
    status: doc.status,
    createdBy: doc.createdBy.toString(),
    createdByName: doc.createdByName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sentAt: doc.sentAt,
    pdfPath: doc.pdfPath,
    // Phase 5 lineage. Always emitted (so the API shape is stable) but empty /
    // false for legacy docs, which is what keeps pre-Phase-5 responses
    // equivalent apart from these additive keys.
    lines: (doc.lines ?? []).map((line: any) => ({
      timesheetId: line.timesheetId?.toString?.() ?? String(line.timesheetId ?? ''),
      assignmentId: line.assignmentId ? String(line.assignmentId) : undefined,
      resourceId: line.resourceId ? String(line.resourceId) : undefined,
      resourceName: line.resourceName,
      weekStart: line.weekStart,
      hours: line.hours,
      rate: line.rate,
      amount: line.amount,
      rateSource: line.rateSource ?? 'invoice',
      source: line.source ?? 'approved',
    })),
    billedTimesheetIds: (doc.billedTimesheetIds ?? []).map((id: any) => id?.toString?.() ?? String(id)),
    approvedOnly: doc.approvedOnly === true,
    assignmentId: doc.assignmentId ? doc.assignmentId.toString() : undefined,
    paidAt: doc.paidAt,
    voidedAt: doc.voidedAt,
    voidReason: doc.voidReason,
  }
}

/**
 * Phase 5 mutation guard: only drafts may be edited. Status-specific messages
 * so `paid`/`void` are blocked loudly (they used to fall through the single
 * `!== 'draft'` check with a misleading "sent" message).
 */
function assertDraftInvoice(invoice: Invoice): void {
  if (invoice.status === 'draft') return
  if (invoice.status === 'sent') throw new Error('Cannot modify a sent invoice')
  if (invoice.status === 'paid') throw new Error('Cannot modify a paid invoice')
  throw new Error('Cannot modify a voided invoice')
}

export interface CollectBillableOptions {
  /** Invoice rate used when an assignment has no usable billRate. */
  hourlyRate: number
  /** Phase 5 scope: only timesheets linked to this assignment. */
  assignmentId?: string
  /** Phase 5 scope: only these timesheets. */
  timesheetIds?: string[]
  /**
   * Phase 5 create-flow preview: per-EMPLOYEE rate overrides the admin
   * typed into the new-invoice UI before the invoice is created. Keys
   * are resource ids (users._id); each key is expanded across every
   * billable timesheet of that employee. Applied as
   * `rateSource: 'manual'` (an invoice-level price decision, never an
   * assignment/timesheet mutation) and folded into `fixedCost` exactly
   * like a post-create `updateInvoiceRates` would. Empty/undefined ⇒
   * no overrides. Expansion intersects with the collected set, so a
   * forged key for an employee who is not being billed is ignored.
   */
  lineRateOverrides?: Record<string, number>
}

export interface BillableCollection {
  lines: InvoiceLine[]
  /** What gets stored as billedTimesheetIds — the double-bill reservation. */
  billedTimesheetIds: string[]
  billableHours: number
  fixedCost: number
  /** The approved + unbilled timesheets that produced the lines (period span). */
  timesheets: any[]
  /**
   * Phase 5 create flow: the same lines aggregated per employee — one
   * row per resource with summed hours, the effective rate, the line
   * amount sum, and the timesheet ids behind it. This is exactly what
   * the new-invoice UI renders (and what the invoice would persist),
   * computed by the same collector so preview and create can never
   * disagree. `mixedRates` is true when the employee's lines would
   * carry different captured rates (e.g. a billRate change between
   * weeks) and no override is applied yet.
   */
  employees: EmployeeBillingSummary[]
}

/** Per-employee aggregation of a BillableCollection (see BillableCollection). */
export interface EmployeeBillingSummary {
  resourceId: string
  resourceName: string
  /** Summed billable (regular Mon–Fri) hours across the employee's lines. */
  hours: number
  /**
   * Effective rate. With an override applied this is the override;
   * otherwise the employee's captured rate (or the invoice rate). When
   * `mixedRates` is true, this is the rate of the first line in
   * deterministic order and the UI should flag the row.
   */
  rate: number
  /** Sum of the employee's line amounts (round2 per line, then summed). */
  amount: number
  rateSource: InvoiceLine['rateSource']
  /** True when the employee's lines carry different captured rates. */
  mixedRates: boolean
  /** The timesheet ids behind the row — the double-bill reservation keys. */
  timesheetIds: string[]
}

/**
 * Flow Integration Phase 5 — the approved-only billing collector.
 *
 * Returns every timesheet of `projectId` that is (1) `status: 'approved'`
 * (draft/pending/declined/withdrawn are NEVER billed), (2) NOT already reserved
 * by another non-void invoice, and (3) inside the optional assignment/timesheet
 * scope when given. Billable hours use the SAME Mon–Fri regular rule as legacy
 * (overtime is never billable here either).
 *
 * Each line snapshots `billRate = assignment.billRate ?? invoice.hourlyRate`,
 * but a backfilled assignment with `billRate: 0` counts as "rate not captured
 * yet" and falls back to the invoice rate — a $0 line would silently zero out
 * revenue, which the risk log forbids. `rateSource` records which one was used.
 *
 * `alreadyBilled` is the union over NON-VOID invoices only: voiding an invoice
 * releases its reservation (Phase 5 acceptance: "void releases").
 */
export async function collectBillableTimesheets(
  projectId: string,
  opts: CollectBillableOptions,
): Promise<BillableCollection> {
  const db = await getDb()

  // 1. Reservation set — every timesheet id claimed by a NON-void invoice.
  const invoiced = await db
    .collection(COLLECTIONS.INVOICES)
    .find({ projectId: new ObjectId(projectId) })
    .toArray()
  const alreadyBilled = new Set<string>()
  for (const inv of invoiced) {
    if (inv.status === 'void') continue // void releases the reservation
    for (const id of inv.billedTimesheetIds ?? []) {
      alreadyBilled.add(String(id))
    }
  }

  // 2. Candidate query: approved + in-scope, minus the reservation.
  const query: Record<string, unknown> = {
    projectId: new ObjectId(projectId),
    status: 'approved',
  }
  if (opts.assignmentId) {
    query.assignmentId = new ObjectId(opts.assignmentId)
  }
  const idClause: Record<string, unknown> = {}
  if (opts.timesheetIds?.length) {
    const ids = opts.timesheetIds.map((id) => {
      if (!ObjectId.isValid(id)) throw new Error(`Invalid timesheet id: ${id}`)
      return new ObjectId(id)
    })
    idClause.$in = ids // intersect: ONLY these …
  }
  if (alreadyBilled.size > 0) {
    idClause.$nin = [...alreadyBilled].map((id) => new ObjectId(id)) // … minus reserved
  }
  if (Object.keys(idClause).length > 0) {
    query._id = idClause
  }

  const candidates = await db.collection(COLLECTIONS.TIMESHEETS).find(query).toArray()
  // Belt-and-braces: re-apply EVERY predicate in JS too, so a dumb query layer
  // (or a test mock that ignores filters) can never bill a non-approved or
  // already-reserved timesheet. The query does the heavy lifting in prod; this
  // filter is the authoritative gate.
  const scopeIds = opts.timesheetIds?.length ? new Set(opts.timesheetIds.map(String)) : null
  const timesheets = candidates.filter((ts) => {
    if (String(ts.projectId) !== String(projectId)) return false
    if (ts.status !== 'approved') return false
    if (alreadyBilled.has(String(ts._id))) return false
    if (opts.assignmentId && String(ts.assignmentId ?? '') !== opts.assignmentId) return false
    if (scopeIds && !scopeIds.has(String(ts._id))) return false
    return true
  })

  // 3. Snapshot bill rates: batch-load every referenced assignment once.
  const assignmentIds = [
    ...new Set(
      timesheets
        .map((ts) => ts.assignmentId)
        .filter(Boolean)
        .map((id: any) => String(id)),
    ),
  ]
  const assignmentRate = new Map<string, number>()
  if (assignmentIds.length > 0) {
    const assignments = await db
      .collection(COLLECTIONS.ASSIGNMENTS)
      .find({ _id: { $in: assignmentIds.map((id) => new ObjectId(id)) } })
      .toArray()
    for (const assignment of assignments) {
      assignmentRate.set(String(assignment._id), assignment.billRate)
    }
  }

  // 3b. Snapshot resource names: batch-load every timesheet's user once
  // so the per-employee rows (and the lines) can show who worked, not
  // just an id. A missing user degrades to 'Unknown resource', never
  // breaks billing.
  const userIds = [
    ...new Set(
      timesheets
        .map((ts) => ts.userId)
        .filter(Boolean)
        .map((id: any) => String(id)),
    ),
  ]
  const userName = new Map<string, string>()
  if (userIds.length > 0) {
    const users = await db
      .collection(COLLECTIONS.USERS)
      .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
      .toArray()
    for (const user of users) {
      userName.set(String(user._id), user.name ?? 'Unknown resource')
    }
  }

  // 4. Build one line per timesheet (Mon–Fri regular hours only).
  // Overrides are keyed by RESOURCE id (employee): one typed rate
  // prices every billable timesheet of that employee.
  const overrides = opts.lineRateOverrides ?? {}
  const lines: InvoiceLine[] = []
  for (const ts of timesheets) {
    const hours = billableHoursOf(ts)
    if (hours <= 0) continue // no billable time → nothing to trace or bill
    const resourceId = ts.userId ? String(ts.userId) : undefined
    const rawRate = ts.assignmentId
      ? assignmentRate.get(String(ts.assignmentId))
      : undefined
    // 0 / null / undefined all mean "no usable captured rate" → invoice rate.
    const captured = typeof rawRate === 'number' && rawRate > 0
    const baseRate = captured ? rawRate : opts.hourlyRate
    const baseSource: InvoiceLine['rateSource'] = captured ? 'assignment' : 'invoice'
    // Phase 5 create-flow preview: a per-employee override typed in the
    // UI wins over the captured/invoice rate. Stored as 'manual' so the
    // audit trail records that this line was priced by decision, not by
    // record. Keys that match no employee in the collected set are
    // simply never read — a forged body cannot touch other timesheets.
    const override = resourceId ? overrides[resourceId] : undefined
    const hasOverride = typeof override === 'number' && Number.isFinite(override) && override >= 0
    const rate = hasOverride ? override : baseRate
    const rateSource: InvoiceLine['rateSource'] = hasOverride ? 'manual' : baseSource
    const amount = Math.round(rate * hours * 100) / 100
    lines.push({
      timesheetId: String(ts._id),
      assignmentId: ts.assignmentId ? String(ts.assignmentId) : undefined,
      resourceId,
      resourceName: resourceId ? (userName.get(resourceId) ?? 'Unknown resource') : 'Unknown resource',
      weekStart: ts.weekStart,
      hours,
      rate,
      amount,
      rateSource,
      source: 'approved',
    })
  }

  // Deterministic order (week, then resource) so invoices are reproducible.
  lines.sort((a, b) =>
    a.weekStart === b.weekStart
      ? String(a.resourceId ?? '').localeCompare(String(b.resourceId ?? ''))
      : a.weekStart.localeCompare(b.weekStart),
  )

  const billableHours = lines.reduce((sum, line) => sum + line.hours, 0)
  const fixedCost = Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100
  const billedTimesheetIds = lines.map((line) => line.timesheetId)
  // Period span only covers the timesheets we actually billed.
  const billedSet = new Set(billedTimesheetIds)
  const billedTimesheets = timesheets.filter((ts) => billedSet.has(String(ts._id)))

  // 5. Aggregate the same lines per employee — one UI row per
  // resource. Hours and amounts are summed from the lines
  // themselves (already round2'd per line), so this aggregation
  // can never disagree with fixedCost.
  const byResource = new Map<string, InvoiceLine[]>()
  for (const line of lines) {
    const key = String(line.resourceId ?? '')
    if (!byResource.has(key)) byResource.set(key, [])
    byResource.get(key)!.push(line)
  }
  const employees: EmployeeBillingSummary[] = [...byResource.entries()]
    .filter(([resourceId]) => resourceId !== '')
    .map(([resourceId, resourceLines]) => ({
      resourceId,
      resourceName: resourceLines[0].resourceName ?? 'Unknown resource',
      hours: resourceLines.reduce((sum, line) => sum + line.hours, 0),
      rate: resourceLines[0].rate,
      amount: Math.round(resourceLines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100,
      rateSource: resourceLines[0].rateSource,
      mixedRates: new Set(resourceLines.map((line) => line.rate)).size > 1,
      timesheetIds: resourceLines.map((line) => line.timesheetId),
    }))

  return {
    lines,
    billedTimesheetIds,
    billableHours,
    fixedCost,
    timesheets: billedTimesheets,
    employees,
  }
}

/**
 * Flow Integration Phase 5 — read-only preview of the approved-only collector.
 *
 * Thin wrapper around `collectBillableTimesheets` so the new-invoice UI and the
 * eventual `createInvoice` can never disagree: the lines, hours, rates, and
 * amounts returned here are exactly what the service would persist. The
 * wrapper exists (rather than exporting the collector directly) so the preview
 * shape stays stable and a future "preview must not reserve" change is a single
 * edit. It is side-effect free — no reservation is written, so an admin can
 * shop per-employee rates before committing.
 */
export async function previewBillableTimesheets(
  projectId: string,
  opts: CollectBillableOptions,
): Promise<BillableCollection> {
  return collectBillableTimesheets(projectId, opts)
}

export async function createInvoice(input: {
  projectId: string
  /** Legacy/optional: only used as the fallback period when the project has no timesheets. */
  weekStart?: string
  /** Optional override of the project's default hourly rate. */
  hourlyRate?: number
  /** Phase 5: bill only approved, unbilled timesheets (default resolved from the flag). */
  approvedOnly?: boolean
  /** Phase 5: restrict billing scope to this assignment. */
  assignmentId?: string
  /** Phase 5: restrict billing scope to these timesheets. */
  timesheetIds?: string[]
  /**
   * Phase 5 create-flow preview: per-EMPLOYEE rate overrides typed
   * into the new-invoice UI. Keys are resource ids (users._id);
   * the collector expands each across the employee's billable
   * timesheets. Applied as `rateSource: 'manual'` (an
   * invoice-level price decision, never an assignment/timesheet
   * mutation) and folded into `fixedCost` exactly like a
   * post-create `updateInvoiceRates` would. Empty ⇒ no
   * overrides, and the invoice is created with the
   * captured/invoice rates.
   */
  lineRateOverrides?: Record<string, number>
  /**
   * Variable costs added in the same request as creation (one
   * round trip instead of create-then-PATCH). total is always
   * re-derived server-side as fixedCost + variableCostTotal.
   */
  variableCosts?: VariableCostInput[]
  adminUserId: string
  adminUserName: string
}): Promise<Invoice> {
  const db = await getDb()
  const adminId = new ObjectId(input.adminUserId)

  // 1. Validate project + rate. The admin may override the project's default
  // rate; otherwise the project's own rate applies.
  const project = await getProjectById(input.projectId)
  if (!project) {
    throw new Error('Project not found')
  }
  const hourlyRate = input.hourlyRate ?? project.hourlyRate
  if (hourlyRate == null) {
    throw new Error(
      'Cannot create invoice: project has no hourly rate set and none was provided',
    )
  }

  // 2. One open draft per project — the draft already covers all logged time,
  // so a second concurrent draft would double-bill. Checked BEFORE any
  // collection so the actionable message ("send it first") wins over the
  // collector's "no unbilled hours" (the open draft holds the reservation).
  const existingDraft = await db
    .collection(COLLECTIONS.INVOICES)
    .findOne({ projectId: new ObjectId(input.projectId), status: 'draft' })
  if (existingDraft) {
    throw new Error(
      'An open draft invoice already exists for this project — send it before creating a new one',
    )
  }

  // Phase 9 CUTOVER (flowIntegration.md §Phase 9.1): the approved-only path is
  // now the DEFAULT for every flow-enabled deployment (any phase beyond
  // 'legacy' — prod runs 'full'), no longer only 'invoices'+. Two escape
  // hatches survive without a redeploy: per-request `approvedOnly: false`
  // (byte-identical legacy sum-all) and per-deploy `FLOW_INTEGRATION_PHASE=`
  // unset/'legacy', which restores the old flag-off default.
  const approvedOnly = input.approvedOnly ?? (getFlowIntegrationPhase() !== 'legacy')

  // 2. Compute fixed cost (+ lines when approvedOnly). The legacy branch sums
  // EVERY timesheet (all team members, all weeks, all statuses) with no
  // lineage — byte-for-byte the old math. The approved branch bills only
  // approved, not-yet-billed timesheets and records per-timesheet `lines[]`
  // so every dollar traces back to a timesheets._id.
  let billableHours: number
  let fixedCost: number
  let lines: InvoiceLine[] = []
  let billedTimesheetIds: string[] = []
  let timesheets: any[]

  if (approvedOnly) {
    const collection = await collectBillableTimesheets(input.projectId, {
      hourlyRate,
      assignmentId: input.assignmentId,
      timesheetIds: input.timesheetIds,
      lineRateOverrides: input.lineRateOverrides,
    })
    lines = collection.lines
    billedTimesheetIds = collection.billedTimesheetIds
    billableHours = collection.billableHours
    fixedCost = collection.fixedCost
    timesheets = collection.timesheets
    if (lines.length === 0) {
      throw new Error('No approved unbilled hours')
    }
  } else {
    timesheets = await db
      .collection(COLLECTIONS.TIMESHEETS)
      .find({
        projectId: new ObjectId(input.projectId),
      })
      .toArray()
    billableHours = 0
    for (const ts of timesheets) {
      billableHours += billableHoursOf(ts)
    }
    fixedCost = billableHours * hourlyRate
  }

  // 3. Billing period covers the whole logged span: first logged week → last
  // logged week. Falls back to the caller's weekStart, then to the current
  // week, when the project has no timesheets yet.
  const loggedWeeks = timesheets
    .map((ts) => ts.weekStart as string)
    .filter(Boolean)
    .sort()
  const weekStart = loggedWeeks[0] ?? (input.weekStart ? normalizeToMonday(input.weekStart) : currentMonday())
  const lastWeek = loggedWeeks[loggedWeeks.length - 1] ?? weekStart
  const weekEnd = weekEndFromStart(lastWeek)

  // 4. Generate invoice number
  const invoiceNumber = await nextInvoiceNumber()
  const periodLabel = buildSpanPeriodLabel(weekStart, weekEnd)
  const now = new Date()

  const doc: Record<string, any> = {
    invoiceNumber,
    projectId: new ObjectId(input.projectId),
    projectName: project.name,
    weekStart,
    weekEnd,
    periodLabel,
    hourlyRate,
    billableHours,
    fixedCost,
    variableCosts: [],
    variableCostTotal: 0,
    total: fixedCost,
    status: 'draft',
    createdBy: adminId,
    createdByName: input.adminUserName,
    createdAt: now,
    updatedAt: now,
    // Phase 5 lineage. Written ONLY on the approved path — the legacy path
    // keeps the document shape exactly as it was (no `lines`/`billedTimesheetIds`
    // keys at all), so pre-Phase-5 clients see byte-identical payloads.
    ...(approvedOnly
      ? {
          lines,
          billedTimesheetIds,
          approvedOnly: true,
          ...(input.assignmentId ? { assignmentId: new ObjectId(input.assignmentId) } : {}),
        }
      : {}),
  }

  const result = await db.collection(COLLECTIONS.INVOICES).insertOne(doc)

  // Phase 9.4: the one-open-draft guard above is check-then-act, so two
  // concurrent creates can both pass it. Re-check AFTER the insert and let
  // the HIGHER ObjectId back out — a deterministic tie-break that leaves
  // exactly one open draft however the two calls interleave (lower id wins;
  // the loser deletes its own insert and reports the same actionable guard
  // message as the sequential path).
  const racedDraft = await db.collection(COLLECTIONS.INVOICES).findOne({
    projectId: new ObjectId(input.projectId),
    status: 'draft',
    _id: { $ne: result.insertedId },
  })
  if (racedDraft && String(result.insertedId) > String(racedDraft._id)) {
    await db.collection(COLLECTIONS.INVOICES).deleteOne({ _id: result.insertedId })
    throw new Error(
      'An open draft invoice already exists for this project — send it before creating a new one',
    )
  }

  const invoice = toInvoice({ ...doc, _id: result.insertedId })

  // Inline variable costs (Phase 5 create flow): applied in the same
  // request so creation is one round trip. total is re-derived from
  // fixedCost + variableCostTotal — the same math addVariableCosts
  // uses, so create-with-costs and create-then-add are identical.
  let finalInvoice = invoice
  if (input.variableCosts && input.variableCosts.length > 0) {
    finalInvoice = await addVariableCosts(
      result.insertedId.toString(),
      input.variableCosts,
      input.adminUserId,
    )
  }

  await createActivity({
    userId: input.adminUserId,
    projectId: input.projectId,
    description: `Invoice ${invoice.invoiceNumber} created for ${project.name} (week of ${weekStart}).`,
  })

  return finalInvoice
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const db = await getDb()
  const invoice = await db
    .collection(COLLECTIONS.INVOICES)
    .findOne({ _id: new ObjectId(id) })
  if (!invoice) return null
  return toInvoice(invoice)
}

export async function listProjectInvoices(
  projectId: string,
  filters?: { status?: InvoiceStatus; from?: string; to?: string },
): Promise<Invoice[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (projectId) {
    query.projectId = new ObjectId(projectId)
  }
  if (filters?.status) query.status = filters.status
  if (filters?.from || filters?.to) {
    const weekStartQuery: Record<string, unknown> = {}
    if (filters.from) weekStartQuery.$gte = filters.from
    if (filters.to) weekStartQuery.$lte = filters.to
    query.weekStart = weekStartQuery
  }
  const invoices = await db
    .collection(COLLECTIONS.INVOICES)
    .find(query)
    .sort({ createdAt: -1 })
    .toArray()
  return invoices.map(toInvoice)
}

export async function addVariableCosts(
  invoiceId: string,
  items: VariableCostInput[],
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  assertDraftInvoice(invoice)

  const costs = items.map((item) => ({
    amount: item.amount,
    reason: item.reason,
  }))

  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $push: {
          variableCosts: { $each: costs },
        } as any,
        $set: { updatedAt: new Date() },
      } as any,
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  const updated = toInvoice(result)
  const newVariableCostTotal = updated.variableCosts.reduce((s, v) => s + v.amount, 0)
  const newTotal = updated.fixedCost + newVariableCostTotal
  await db.collection(COLLECTIONS.INVOICES).updateOne(
    { _id: new ObjectId(invoiceId) },
    { $set: { variableCostTotal: newVariableCostTotal, total: newTotal, updatedAt: new Date() } },
  )

  const final = toInvoice(
    await db.collection(COLLECTIONS.INVOICES).findOne({ _id: new ObjectId(invoiceId) }),
  )

  await createActivity({
    userId: adminUserId,
    projectId: invoiceId,
    description: `Variable costs added to invoice ${invoice.invoiceNumber}.`,
  })

  return final
}

/**
 * Updates the hourly rate on a DRAFT invoice and recomputes fixed cost =
 * billable hours × new rate. The billed hours never change here — only the
 * price per hour.
 */
export async function updateInvoiceRate(
  invoiceId: string,
  hourlyRate: number,
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  assertDraftInvoice(invoice)

  const billableHours = invoice.billableHours ?? 0
  const fixedCost = billableHours * hourlyRate

  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $set: {
          hourlyRate,
          fixedCost,
          total: fixedCost + invoice.variableCostTotal,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  await createActivity({
    userId: adminUserId,
    projectId: invoice.projectId,
    timesheetId: invoiceId,
    description: `Hourly rate updated to $${hourlyRate.toFixed(2)} on invoice ${invoice.invoiceNumber}.`,
  })

  return toInvoice(result)
}

/**
 * Flow Integration Phase 5 — update the rate on ONE line of a draft invoice and
 * recompute that line's amount plus the invoice's fixed cost + total.
 *
 * Lines are keyed by `timesheetId` (the unique per-timesheet identifier the
 * collector already emits). A line's rate is normally the assignment's billRate
 * (rateSource 'assignment') or the invoice's hourlyRate ('invoice'); this
 * override records the admin's explicit per-employee price and marks the line
 * `rateSource: 'manual'` so the provenance is auditable. It does NOT touch the
 * underlying assignment or timesheet — it is an invoice-level price decision,
 * the same way `hourlyRate` is.
 *
 * `fixedCost` is always re-derived as the sum of every line's amount, so editing
 * one rate can never leave the invoice internally inconsistent.
 */
export async function updateLineRate(
  invoiceId: string,
  timesheetId: string,
  rate: number,
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  assertDraftInvoice(invoice)
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('Rate must be 0 or greater')
  }

  const line = (invoice.lines ?? []).find((l) => l.timesheetId === timesheetId)
  if (!line) {
    throw new Error('Line not found on this invoice')
  }

  const newAmount = round2(rate * line.hours)
  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $set: {
          'lines.$[elem].rate': rate,
          'lines.$[elem].amount': newAmount,
          'lines.$[elem].rateSource': 'manual',
          updatedAt: new Date(),
        },
      } as any,
      {
        returnDocument: 'after',
        arrayFilters: [{ 'elem.timesheetId': timesheetId }],
      },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  const updated = toInvoice(result)
  const recomputedFixed = round2((updated.lines ?? []).reduce((s, l) => s + l.amount, 0))
  await db.collection(COLLECTIONS.INVOICES).updateOne(
    { _id: new ObjectId(invoiceId) },
    { $set: { fixedCost: recomputedFixed, total: recomputedFixed + updated.variableCostTotal, updatedAt: new Date() } },
  )

  const final = toInvoice(
    await db.collection(COLLECTIONS.INVOICES).findOne({ _id: new ObjectId(invoiceId) }),
  )

  await createActivity({
    userId: adminUserId,
    projectId: invoice.projectId,
    timesheetId: invoiceId,
    description: `Line rate for timesheet ${timesheetId.slice(-6)} updated to $${rate.toFixed(2)} on invoice ${invoice.invoiceNumber}.`,
  })

  return final
}

/**
 * Flow Integration Phase 5 — atomically update the rate on several
 * lines of a draft invoice (typically every line of one employee)
 * and re-derive fixedCost = Σ line amounts and
 * total = fixedCost + variableCostTotal in a single write.
 *
 * The per-employee create/edit UI sends one row per employee, which
 * expands to that employee's timesheet ids on the invoice. Unknown
 * timesheet ids are rejected loudly so a stale UI can never silently
 * price a line it no longer sees. Like `updateLineRate`, this is an
 * invoice-level price decision (`rateSource: 'manual'`) — the
 * underlying assignment/timesheet records are never touched.
 *
 * `fixedCost` is re-derived as the sum of every line's amount, so a
 * batch edit can never leave the invoice internally inconsistent.
 */
export async function updateInvoiceRates(
  invoiceId: string,
  rates: { timesheetId: string; rate: number }[],
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  assertDraftInvoice(invoice)

  if (rates.length === 0) throw new Error('At least one rate is required')
  const requested = new Map<string, number>()
  for (const entry of rates) {
    if (!Number.isFinite(entry.rate) || entry.rate < 0) {
      throw new Error('Rate must be 0 or greater')
    }
    requested.set(String(entry.timesheetId), entry.rate)
  }

  const lines = invoice.lines ?? []
  const missing = [...requested.keys()].filter(
    (timesheetId) => !lines.some((line) => line.timesheetId === timesheetId),
  )
  if (missing.length > 0) {
    throw new Error('Line not found on this invoice')
  }

  // Rebuild the lines array in JS (only the requested lines change)
  // and persist it in one $set — atomic, and re-deriving fixedCost
  // from the rebuilt array means the invoice can never be left with
  // a stale total.
  const updatedLines = lines.map((line) => {
    const rate = requested.get(line.timesheetId)
    if (rate === undefined) return line
    return {
      ...line,
      rate,
      amount: round2(rate * line.hours),
      rateSource: 'manual' as const,
    }
  })
  const recomputedFixed = round2(updatedLines.reduce((sum, line) => sum + line.amount, 0))

  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $set: {
          lines: updatedLines,
          fixedCost: recomputedFixed,
          total: recomputedFixed + invoice.variableCostTotal,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  const final = toInvoice(result)

  await createActivity({
    userId: adminUserId,
    projectId: invoice.projectId,
    timesheetId: invoiceId,
    description: `Rates updated on ${requested.size} line${requested.size === 1 ? '' : 's'} of invoice ${final.invoiceNumber}.`,
  })

  return final
}

export async function removeVariableCosts(
  invoiceId: string,
  costIds: string[],
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  assertDraftInvoice(invoice)

  const objectIds = costIds.map((id) => {
    try {
      return new ObjectId(id)
    } catch {
      throw new Error(`Invalid variable cost ID: ${id}`)
    }
  })

  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $pull: {
          variableCosts: { _id: { $in: objectIds } },
        } as any,
        $set: { updatedAt: new Date() },
      } as any,
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  const updated = toInvoice(result)
  await db.collection(COLLECTIONS.INVOICES).updateOne(
    { _id: new ObjectId(invoiceId) },
    {
      $set: {
        variableCostTotal: updated.variableCostTotal,
        total: updated.fixedCost + updated.variableCostTotal,
        updatedAt: new Date(),
      },
    },
  )

  const final = toInvoice(
    await db.collection(COLLECTIONS.INVOICES).findOne({ _id: new ObjectId(invoiceId) }),
  )

  await createActivity({
    userId: adminUserId,
    projectId: invoiceId,
    description: `Variable costs removed from invoice ${invoice.invoiceNumber}.`,
  })

  return final
}

export async function sendInvoice(
  invoiceId: string,
  adminUserId: string,
  recipientEmail?: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status === 'paid') throw new Error('Cannot send a paid invoice')
  if (invoice.status === 'void') throw new Error('Cannot send a voided invoice')
  if (invoice.status !== 'draft') {
    throw new Error('Invoice is already sent')
  }

  const now = new Date()
  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $set: {
          status: 'sent',
          sentAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  const sent = toInvoice(result)

  await createActivity({
    userId: adminUserId,
    projectId: invoice.projectId,
    timesheetId: invoiceId,
    description: `Invoice ${sent.invoiceNumber} sent for ${sent.projectName}.`,
  })

  // Best-effort delivery: if a recipient email was supplied (or the project
  // has a client email on file), attach the rendered PDF and send it. Sending
  // must never roll back the status change.
  const to = recipientEmail?.trim() || (await resolveInvoiceRecipient(sent.projectId))
  if (to) {
    try {
      const project = await getProjectById(sent.projectId)
      const pdf = await buildInvoicePdf({
        invoice: sent,
        clientName: project?.client ?? undefined,
        sowNumber: project?.sowNumber ?? undefined,
        issuedOn: now,
      })
      await sendInvoiceEmail(to, sent.invoiceNumber, sent.projectName, pdf, `${sent.invoiceNumber}.pdf`)
    } catch (err) {
      logger.warn({ err, invoiceId, to }, 'invoice email delivery failed (status already sent)')
    }
  }

  return sent
}

/**
 * Phase 5: mark an invoice paid (payment received). Terminal state — no other
 * transition is allowed afterwards. Only `sent` invoices can be paid.
 */
export async function markInvoicePaid(
  invoiceId: string,
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status === 'paid') throw new Error('Invoice is already paid')
  if (invoice.status === 'void') throw new Error('Cannot pay a voided invoice')
  if (invoice.status !== 'sent') {
    throw new Error('Only sent invoices can be marked paid')
  }

  const now = new Date()
  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'sent' },
      { $set: { status: 'paid', paidAt: now, updatedAt: now } },
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or no longer sent')

  await createActivity({
    userId: adminUserId,
    projectId: invoice.projectId,
    timesheetId: invoiceId,
    description: `Invoice ${invoice.invoiceNumber} marked paid.`,
  })

  return toInvoice(result)
}

/**
 * Phase 5: void a draft or sent invoice. Voiding RELEASES the timesheet
 * reservation — `collectBillableTimesheets` only honours non-void invoices,
 * so those timesheets become billable again. Never allowed once paid
 * (money already collected), and never twice.
 */
export async function invoiceVoid(
  invoiceId: string,
  adminUserId: string,
  reason?: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status === 'void') throw new Error('Invoice is already voided')
  if (invoice.status === 'paid') {
    throw new Error('A paid invoice cannot be voided — issue a credit note instead')
  }

  const now = new Date()
  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: { $in: ['draft', 'sent'] } },
      {
        $set: {
          status: 'void',
          voidedAt: now,
          voidReason: reason ?? null,
          updatedAt: now,
        },
      } as any,
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already voided')

  await createActivity({
    userId: adminUserId,
    projectId: invoice.projectId,
    timesheetId: invoiceId,
    description: `Invoice ${invoice.invoiceNumber} voided${reason ? ` (${reason})` : ''}.`,
  })

  return toInvoice(result)
}

/**
 * Best-effort lookup of a client email for the project. The project record
 * stores a free-text client name, so this tries the users collection for a
 * matching client contact; returns undefined when nothing is found (in which
 * case the invoice is marked sent but no email goes out).
 */
async function resolveInvoiceRecipient(projectId: string): Promise<string | undefined> {
  try {
    const project = await getProjectById(projectId)
    if (!project?.client) return undefined
    const db = await getDb()
    const contact = await db
      .collection(COLLECTIONS.USERS)
      .findOne({ email: project.client.toLowerCase().trim() })
    return contact?.email ?? undefined
  } catch {
    return undefined
  }
}
