import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { createActivity } from './activity.service.js'
import { addDays, getTimesheetById } from './timesheet.service.js'

/**
 * Flow Integration Phase 6 — Payroll / Vendor Payments (see
 * /flowIntegration.md §5 Phase 6).
 *
 * This is a NEW domain with no legacy writer: `payrolls` was reserved in
 * Phase 0 and nothing else reads or writes it, so every shape here is ours.
 * The invariants that matter for money:
 *
 *   * PREVIEW IS PURE — `previewPayroll()` performs zero writes (checklist 6.3).
 *   * APPROVED-ONLY — only an `approved` timesheet can produce a payroll
 *     (checklist 6.4); draft/pending/declined/withdrawn never pay out.
 *   * IDEMPOTENT — one payroll document per timesheet, enforced by the
 *     unique `timesheetId` index AND a service guard: an existing `paid`
 *     document is immutable (returned as-is); an existing `draft`/`void`
 *     document is RECOMPUTED from current rates and (re)opened as `draft`,
 *     which is also the "payRateMissing → fix the assignment → retry" flow.
 *   * NO SILENT $0 MATH — `payRate: 0`/unset at both sources sets
 *     `payRateMissing: true` and `pay` is blocked until it is fixed (risk log).
 *   * PAID IS TERMINAL; void is draft-only and revivable via re-create.
 */

export type PayrollStatus = 'draft' | 'paid' | 'void'

/** Worker classification, branched from Phase 2 `user.resourceType` (§9). */
export type PayrollType = 'w2' | 'c2c' | 'offshore' | 'unknown'

/** Where a usable pay rate came from. 'none' ⇒ payRateMissing. */
export type PayRateSource = 'assignment' | 'user' | 'none'

export interface Payroll {
  id: string
  resourceId: string
  resourceName: string
  assignmentId?: string
  projectId?: string
  timesheetId: string
  /** Pay period start (the timesheet's weekStart). */
  periodStart: string
  /** Period end (weekStart + 6 days). */
  periodEnd: string
  regularHours: number
  overtimeHours: number
  /** All worked hours paid out: regular + overtime (single rate, per §6). */
  hours: number
  payRate: number
  payRateSource: PayRateSource
  /** True when neither the assignment nor the resource carries a usable rate. */
  payRateMissing: boolean
  grossPay: number
  type: PayrollType
  status: PayrollStatus
  createdBy: string
  createdByName: string
  createdAt: Date
  updatedAt: Date
  paidAt?: Date
  paidBy?: string
  voidedAt?: Date
  voidedBy?: string
  voidReason?: string
}

/** Preview shape — the pure calculation plus the context it was built from. */
export interface PayrollPreview {
  timesheetId: string
  timesheetStatus: string
  resourceId: string
  resourceName: string
  assignmentId?: string
  projectId: string
  periodStart: string
  periodEnd: string
  regularHours: number
  overtimeHours: number
  hours: number
  payRate: number
  payRateSource: PayRateSource
  payRateMissing: boolean
  grossPay: number
  type: PayrollType
}

export interface PayrollListFilters {
  resourceId?: string
  assignmentId?: string
  status?: PayrollStatus
  from?: string
  to?: string
}

/** Rounds money to cents — same rule as the invoice service. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function asObjectId(value: unknown): ObjectId | undefined {
  if (value instanceof ObjectId) return value
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value)
  return undefined
}

function toPayroll(doc: any): Payroll {
  return {
    id: doc._id.toString(),
    resourceId: doc.resourceId?.toString(),
    resourceName: doc.resourceName ?? '',
    assignmentId: doc.assignmentId?.toString(),
    projectId: doc.projectId?.toString(),
    timesheetId: doc.timesheetId.toString(),
    periodStart: doc.periodStart,
    periodEnd: doc.periodEnd,
    regularHours: doc.regularHours ?? 0,
    overtimeHours: doc.overtimeHours ?? 0,
    hours: doc.hours ?? 0,
    payRate: doc.payRate ?? 0,
    payRateSource: doc.payRateSource ?? 'none',
    payRateMissing: doc.payRateMissing ?? false,
    grossPay: doc.grossPay ?? 0,
    type: doc.type ?? 'unknown',
    status: doc.status,
    createdBy: doc.createdBy?.toString() ?? '',
    createdByName: doc.createdByName ?? '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    paidAt: doc.paidAt,
    paidBy: doc.paidBy?.toString(),
    voidedAt: doc.voidedAt,
    voidedBy: doc.voidedBy?.toString(),
    voidReason: doc.voidReason ?? undefined,
  }
}

/**
 * Pay-rate resolution: assignment first, then the resource's default.
 * 0 / null / undefined are ALL treated as unset (backfilled assignments carry
 * `payRate: 0`) — falling through to 'none' rather than silently paying $0.
 */
export function resolvePayRate(
  assignment: any,
  resource: any,
): { payRate: number; source: PayRateSource; missing: boolean } {
  const fromAssignment = assignment?.payRate
  if (typeof fromAssignment === 'number' && fromAssignment > 0) {
    return { payRate: fromAssignment, source: 'assignment', missing: false }
  }
  const fromResource = resource?.defaultPayRate
  if (typeof fromResource === 'number' && fromResource > 0) {
    return { payRate: fromResource, source: 'user', missing: false }
  }
  return { payRate: 0, source: 'none', missing: true }
}

/** Worker branch: legacy resources without Phase 2 enrichment stay 'unknown'. */
function resolveType(resource: any): PayrollType {
  const value = resource?.resourceType
  return value === 'w2' || value === 'c2c' || value === 'offshore' ? value : 'unknown'
}

/**
 * Shared pure calculation for preview AND create — both paths MUST agree, so
 * they call the same function. No I/O, no writes.
 */
function computePreview(
  timesheet: {
    id: string
    userId: string
    projectId: string
    weekStart: string
    status: string
    assignmentId?: string
    regularHours: number
    overtimeHours: number
    totalHours: number
  },
  assignment: any,
  resource: any,
): PayrollPreview {
  const rate = resolvePayRate(assignment, resource)
  return {
    timesheetId: timesheet.id,
    timesheetStatus: timesheet.status,
    resourceId: timesheet.userId,
    resourceName: resource?.name ?? '',
    assignmentId: timesheet.assignmentId,
    projectId: timesheet.projectId,
    periodStart: timesheet.weekStart,
    periodEnd: addDays(timesheet.weekStart, 6),
    regularHours: timesheet.regularHours,
    overtimeHours: timesheet.overtimeHours,
    // Workers are paid for ALL worked hours (Mon–Fri + weekend), unlike
    // invoicing which bills regular Mon–Fri only. The docx §6 fixture
    // (168h × $65 = $10,920) is only reachable with weekend hours included.
    hours: timesheet.totalHours,
    payRate: rate.payRate,
    payRateSource: rate.source,
    payRateMissing: rate.missing,
    grossPay: round2(timesheet.totalHours * rate.payRate),
    type: resolveType(resource),
  }
}

/** Loads the timesheet + resource + (optional) assignment context for a calc. */
async function loadContext(timesheetId: string): Promise<{
  timesheet: NonNullable<Awaited<ReturnType<typeof getTimesheetById>>>
  assignment: any
  resource: any
}> {
  if (!ObjectId.isValid(timesheetId)) throw new Error('Timesheet not found')
  const timesheet = await getTimesheetById(timesheetId)
  if (!timesheet) throw new Error('Timesheet not found')

  const db = await getDb()
  const resource = await db
    .collection(COLLECTIONS.USERS)
    .findOne({ _id: new ObjectId(timesheet.userId) })
  if (!resource) throw new Error('Resource not found')

  let assignment: any = null
  if (timesheet.assignmentId) {
    const assignmentId = asObjectId(timesheet.assignmentId)
    if (assignmentId) {
      assignment = await db.collection(COLLECTIONS.ASSIGNMENTS).findOne({ _id: assignmentId })
    }
  }
  return { timesheet, assignment, resource }
}

/**
 * 6.3 — PURE preview: reads the timesheet/resource/assignment, returns the
 * calculation, and performs ZERO writes (asserted by test). Works for any
 * timesheet status so admins can forecast before approving; `timesheetStatus`
 * is included so the caller always sees what it is looking at.
 */
export async function previewPayroll(timesheetId: string): Promise<PayrollPreview> {
  const { timesheet, assignment, resource } = await loadContext(timesheetId)
  return computePreview(timesheet, assignment, resource)
}

/**
 * 6.4 — create (or idempotently refresh) the payroll for an APPROVED timesheet.
 *
 * Idempotency contract (one doc per timesheet, forever):
 *   * no existing doc         → insert a new `draft`
 *   * existing `draft`/`void` → recompute from CURRENT rates, (re)open as
 *                               `draft` (the fix-the-rate-and-retry flow;
 *                               also how a voided draft is re-created)
 *   * existing `paid`         → returned untouched (money already out)
 */
export async function createPayrollFromTimesheet(
  timesheetId: string,
  adminUserId: string,
  adminUserName: string,
): Promise<Payroll> {
  const { timesheet, assignment, resource } = await loadContext(timesheetId)
  // Approval gate: only approved timesheets ever reach payroll.
  if (timesheet.status !== 'approved') {
    throw new Error('Only approved timesheets can be used to create payroll')
  }

  const preview = computePreview(timesheet, assignment, resource)
  const db = await getDb()
  const payrolls = db.collection(COLLECTIONS.PAYROLLS)
  const now = new Date()

  const snapshot = {
    resourceId: new ObjectId(preview.resourceId),
    resourceName: preview.resourceName,
    assignmentId: assignment?._id ?? null,
    projectId: new ObjectId(preview.projectId),
    timesheetId: new ObjectId(preview.timesheetId),
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    regularHours: preview.regularHours,
    overtimeHours: preview.overtimeHours,
    hours: preview.hours,
    payRate: preview.payRate,
    payRateSource: preview.payRateSource,
    payRateMissing: preview.payRateMissing,
    grossPay: preview.grossPay,
    type: preview.type,
  }

  const existing = await payrolls.findOne({ timesheetId: new ObjectId(preview.timesheetId) })
  if (existing?.status === 'paid') {
    // Terminal: an immutable record of money already paid out.
    return toPayroll(existing)
  }
  if (existing) {
    // draft or void → refresh the snapshot from current data and reopen.
    const refreshed = await payrolls.findOneAndUpdate(
      { _id: existing._id },
      {
        $set: { ...snapshot, status: 'draft', updatedAt: now },
        $unset: { paidAt: '', paidBy: '', voidedAt: '', voidedBy: '', voidReason: '' },
      } as any,
      { returnDocument: 'after' },
    )
    if (!refreshed) throw new Error('Payroll not found')
    await createActivity({
      userId: adminUserId,
      projectId: preview.projectId,
      timesheetId: preview.timesheetId,
      description: `Payroll for timesheet refreshed (status draft, gross $${preview.grossPay.toFixed(2)}).`,
    })
    return toPayroll(refreshed)
  }

  const result = await payrolls.insertOne({
    ...snapshot,
    status: 'draft',
    createdBy: new ObjectId(adminUserId),
    createdByName: adminUserName,
    createdAt: now,
    updatedAt: now,
  })
  await createActivity({
    userId: adminUserId,
    projectId: preview.projectId,
    timesheetId: preview.timesheetId,
    description: `Payroll created from timesheet (status draft, gross $${preview.grossPay.toFixed(2)}).`,
  })

  const doc = await payrolls.findOne({ _id: result.insertedId })
  if (!doc) throw new Error('Payroll not found after insert')
  return toPayroll(doc)
}

export async function getPayroll(id: string): Promise<Payroll | null> {
  const _id = asObjectId(id)
  if (!_id) return null
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.PAYROLLS).findOne({ _id })
  return doc ? toPayroll(doc) : null
}

/** 6.5 — admin list with additive filters (resource, assignment, status, range). */
export async function listPayrolls(filters: PayrollListFilters = {}): Promise<Payroll[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  const resourceId = asObjectId(filters.resourceId)
  if (resourceId) query.resourceId = resourceId
  const assignmentId = asObjectId(filters.assignmentId)
  if (assignmentId) query.assignmentId = assignmentId
  if (filters.status) query.status = filters.status
  if (filters.from || filters.to) {
    const range: Record<string, string> = {}
    if (filters.from) range.$gte = filters.from
    if (filters.to) range.$lte = filters.to
    query.periodStart = range
  }
  const docs = await db
    .collection(COLLECTIONS.PAYROLLS)
    .find(query)
    .sort({ createdAt: -1 })
    .toArray()
  return docs.map(toPayroll)
}

/**
 * 6.5 — POST /payrolls/:id/pay. Draft → paid, terminal. Blocked while the
 * pay rate is missing (risk log: no silent $0 math — fix the assignment /
 * resource rate, re-create the draft to refresh it, then pay).
 */
export async function markPayrollPaid(payrollId: string, adminUserId: string): Promise<Payroll> {
  const payroll = await getPayroll(payrollId)
  if (!payroll) throw new Error('Payroll not found')
  if (payroll.status === 'paid') throw new Error('Payroll is already paid')
  if (payroll.status === 'void') throw new Error('Cannot pay a voided payroll')
  if (payroll.payRateMissing) {
    throw new Error(
      'Cannot pay a payroll with a missing pay rate — set the assignment payRate (or resource defaultPayRate), re-create the draft, then pay',
    )
  }

  const now = new Date()
  const db = await getDb()
  const result = await db
    .collection(COLLECTIONS.PAYROLLS)
    .findOneAndUpdate(
      { _id: (asObjectId(payrollId) as ObjectId), status: 'draft' },
      { $set: { status: 'paid', paidAt: now, paidBy: new ObjectId(adminUserId), updatedAt: now } },
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Payroll not found or no longer draft')

  await createActivity({
    userId: adminUserId,
    projectId: payroll.projectId,
    timesheetId: payroll.timesheetId,
    description: `Payroll marked paid (gross $${payroll.grossPay.toFixed(2)}).`,
  })
  return toPayroll(result)
}

/**
 * 6.5 — POST /payrolls/:id/void. Draft → void only: `paid` is money already
 * gone, and voiding twice is a no-op error. A voided draft can be re-created
 * from the same timesheet (create refreshes it back to `draft`).
 */
export async function payrollVoid(
  payrollId: string,
  adminUserId: string,
  reason?: string,
): Promise<Payroll> {
  const payroll = await getPayroll(payrollId)
  if (!payroll) throw new Error('Payroll not found')
  if (payroll.status === 'void') throw new Error('Payroll is already voided')
  if (payroll.status === 'paid') {
    throw new Error('A paid payroll cannot be voided — recover it in the next cycle instead')
  }

  const now = new Date()
  const db = await getDb()
  const result = await db
    .collection(COLLECTIONS.PAYROLLS)
    .findOneAndUpdate(
      { _id: (asObjectId(payrollId) as ObjectId), status: 'draft' },
      {
        $set: {
          status: 'void',
          voidedAt: now,
          voidedBy: new ObjectId(adminUserId),
          voidReason: reason ?? null,
          updatedAt: now,
        },
      } as any,
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Payroll not found or no longer draft')

  await createActivity({
    userId: adminUserId,
    projectId: payroll.projectId,
    timesheetId: payroll.timesheetId,
    description: `Payroll voided${reason ? ` (${reason})` : ''}.`,
  })
  return toPayroll(result)
}
