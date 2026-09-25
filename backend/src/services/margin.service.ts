import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { buildMatchStage, type ReportFilters } from './report.service.js'
import { resolvePayRate } from './payroll.service.js'

/**
 * Flow Integration Phase 7 — margin view (flowIntegration.md §5 Phase 7).
 *
 * READ-ONLY: every number is derived at read time from approved timesheets +
 * assignments + non-void invoice lines. No money is stored or mutated here.
 * Mirrors the docx §6 fixture:
 *
 *   168h × bill $110 = $18,480 billing;  168h × pay $65 = $10,920 cost;
 *   gross margin = (110 − 65) × 168 = $7,560  →  40.9% of billing.
 *
 * Honest-zero policy (deliberate, documented):
 *  - `billRate: 0` on a backfilled assignment is UNSET → those hours report a
 *    NEGATIVE margin, surfacing the data gap instead of hiding it.
 *  - An unresolved payRate contributes $0 cost (inflating this view); the
 *    authoritative guard stays Phase 6's payRateMissing block, which stops the
 *    actual payment. This view stores no money.
 */
export interface MarginFilters {
  projectId?: string
  assignmentId?: string
  from?: string
  to?: string
  /** Defaults to 'approved' (margin only means something on approved work);
   *  'all' passes through buildMatchStage's opt-out. */
  status?: ReportFilters['status']
}

export interface MarginSummary {
  billableHours: number
  billedAmount: number
  payrollCost: number
  grossMargin: number
  marginPct: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100
const round1 = (n: number): number => Math.round(n * 10) / 10

function asObjectId(value: unknown): ObjectId | undefined {
  if (value instanceof ObjectId) return value
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value)
  return undefined
}

export async function getMargin(filters: MarginFilters = {}): Promise<MarginSummary> {
  const db = await getDb()

  // Reuse Phase 0's match builder. `from`/`to` map onto its startDate/
  // endDate (→ weekStart $gte/$lte), so margin's period filter is
  // isomorphic with the sibling /reports endpoints; status defaults to
  // 'approved' here rather than in buildMatchStage (other reports stay
  // opt-in).
  const match = buildMatchStage({
    startDate: filters.from,
    endDate: filters.to,
    projectId: filters.projectId,
    status: filters.status ?? 'approved',
  })
  if (filters.assignmentId) {
    // Malformed id throws → controller 500, same as projectId on the sibling
    // report endpoints (they pass ids to ObjectId unvalidated too).
    match.assignmentId = new ObjectId(filters.assignmentId)
  }

  const timesheets = await db.collection(COLLECTIONS.TIMESHEETS).find(match).toArray()
  if (timesheets.length === 0) {
    return { billableHours: 0, billedAmount: 0, payrollCost: 0, grossMargin: 0, marginPct: 0 }
  }

  // Context: assignments carry billRate/payRate; resources are the pay-rate
  // fallback — resolvePayRate is the exact Phase 6 chain (assignment →
  // user default → missing), shared so payroll and margin can never diverge.
  const assignmentIds: ObjectId[] = []
  const resourceIds: ObjectId[] = []
  for (const ts of timesheets) {
    const assignmentId = asObjectId(ts.assignmentId)
    if (assignmentId) assignmentIds.push(assignmentId)
    const resourceId = asObjectId(ts.userId)
    if (resourceId) resourceIds.push(resourceId)
  }
  const uniq = (ids: ObjectId[]): ObjectId[] => [...new Map(ids.map((id) => [String(id), id])).values()]
  const assignments = assignmentIds.length
    ? await db.collection(COLLECTIONS.ASSIGNMENTS).find({ _id: { $in: uniq(assignmentIds) } }).toArray()
    : []
  const resources = resourceIds.length
    ? await db.collection(COLLECTIONS.USERS).find({ _id: { $in: uniq(resourceIds) } }).toArray()
    : []
  const assignmentById = new Map(assignments.map((a) => [String(a._id), a]))
  const resourceById = new Map(resources.map((u) => [String(u._id), u]))

  // billedAmount: amounts actually billed — non-void invoice lines whose
  // timesheetId is one of the matched timesheets (lines store the id as a
  // string; void invoices are excluded so a voided bill stops counting).
  const matchedIds = new Set(timesheets.map((ts) => String(ts._id)))
  let billedAmount = 0
  const invoices = await db
    .collection(COLLECTIONS.INVOICES)
    .find({ status: { $ne: 'void' }, 'lines.timesheetId': { $in: [...matchedIds] } })
    .toArray()
  for (const invoice of invoices) {
    for (const line of invoice.lines ?? []) {
      if (line?.timesheetId !== undefined && matchedIds.has(String(line.timesheetId))) {
        billedAmount += Number(line.amount ?? 0)
      }
    }
  }

  // Hours basis: ALL worked hours (totalHours) — the same basis payroll uses;
  // docx §6's 168h is only reachable with weekend hours included.
  let billableHours = 0
  let payrollRaw = 0
  let marginRaw = 0
  for (const ts of timesheets) {
    const stored = Number(ts.totalHours)
    const hours = Number.isFinite(stored)
      ? stored
      : Number(ts.regularHours ?? 0) + Number(ts.overtimeHours ?? 0)
    billableHours += hours

    const assignment = assignmentById.get(String(ts.assignmentId))
    const resource = resourceById.get(String(ts.userId))
    const { payRate } = resolvePayRate(assignment, resource)
    payrollRaw += hours * payRate

    // billRate has no fallback chain: 0/unset stays 0 → negative margin
    // (see honest-zero policy above).
    const billRate =
      typeof assignment?.billRate === 'number' && assignment.billRate > 0 ? assignment.billRate : 0
    marginRaw += hours * (billRate - payRate)
  }

  return {
    billableHours: round2(billableHours),
    billedAmount: round2(billedAmount),
    payrollCost: round2(payrollRaw),
    grossMargin: round2(marginRaw),
    // pct = grossMargin / billedAmount (docx: 7560/18480 = 40.9). Guarded:
    // before anything is billed the denominator is 0 → report 0, never
    // NaN/Infinity.
    marginPct: billedAmount > 0 ? round1((marginRaw / billedAmount) * 100) : 0,
  }
}
