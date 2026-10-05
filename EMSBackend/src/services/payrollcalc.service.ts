import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import type { SupportedCurrencyCode } from '../types/auth.js'
import type { PayRateChange, PayrollResult, PayrollRow, PayrollRowStatus } from '../types/finance.js'

/**
 * Payroll (EMSBackend §7.7, task 7.1).
 *
 * Calculation stays server-side per the frontend contract. Hours come from the
 * shared `timesheets` collection, which the platform writes and EMS only reads:
 * each row carries pre-computed `regularHours` / `overtimeHours` / `totalHours`
 * plus a weekly `weekStart` (YYYY-MM-DD) and a `status`.
 *
 * Only `approved` timesheets are paid. A draft or pending week is not a payroll
 * event, and `declined`/`withdrawn` weeks were rejected work — paying any of
 * them would let an unapproved week reach an employee's payslip.
 *
 * `POST /payroll/close` writes one snapshot row PER TIMESHEET, not per employee.
 * That shape is forced by the platform's `payrolls.timesheetId` unique index: a
 * per-employee row would leave `timesheetId` null, and a unique index admits at
 * most one null, so the second employee would fail with E11000.
 */

/** Statuses that count toward pay. */
const PAID_STATUSES = ['approved']

const DEFAULT_CURRENCY: SupportedCurrencyCode = 'USD'

/** `YYYY-MM` for the month before `date` — payroll is a retrospective view. */
export function previousPeriod(date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() // 0-based
  const prev = new Date(Date.UTC(year, month - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Round to 2dp so float drift never shows up in a money column. */
function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

interface TimesheetDoc {
  _id: ObjectId
  userId?: ObjectId
  projectId?: ObjectId
  weekStart?: string
  totalHours?: number
  regularHours?: number
  overtimeHours?: number
}

/**
 * GET /payroll — rows for one period, plus that period's pay-rate changes.
 * Rows are `draft` until the period is closed, then `approved`.
 */
export async function getPayroll(period?: string): Promise<PayrollResult> {
  const db = await getDb()
  const resolvedPeriod = period ?? previousPeriod()

  const timesheets = await db
    .collection(COLLECTIONS.TIMESHEETS)
    .find({
      // `weekStart` is a YYYY-MM-DD string, so a prefix match is the month.
      weekStart: { $regex: `^${resolvedPeriod}` },
      status: { $in: PAID_STATUSES },
    })
    .toArray() as unknown as TimesheetDoc[]

  // Sum approved hours per employee.
  const hoursByUser = new Map<string, number>()
  for (const sheet of timesheets) {
    const key = String(sheet.userId ?? '')
    if (!key) continue
    hoursByUser.set(key, (hoursByUser.get(key) ?? 0) + (sheet.totalHours ?? 0))
  }

  const userIds = [...hoursByUser.keys()].filter((id) => ObjectId.isValid(id))
  const users = userIds.length
    ? await db
        .collection(COLLECTIONS.USERS)
        .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
        .toArray()
    : []
  const userById = new Map(users.map((u: any) => [String(u._id), u]))

  // A closed period has snapshot rows; that is what promotes draft -> approved.
  const closedUserIds = new Set(
    (
      await db
        .collection(COLLECTIONS.PAYROLLS)
        .find({ period: resolvedPeriod })
        .project({ userId: 1, resourceId: 1 })
        .toArray()
    ).flatMap((p: any) => [p.userId ? String(p.userId) : '', p.resourceId ? String(p.resourceId) : ''])
      .filter(Boolean),
  )

  const rows: PayrollRow[] = []
  for (const [userId, hours] of hoursByUser.entries()) {
    const user: any = userById.get(userId)
    const payRate = user?.payRate ?? 0
    const status: PayrollRowStatus = closedUserIds.has(userId) ? 'approved' : 'draft'
    rows.push({
      id: `${resolvedPeriod}:${userId}`,
      userId,
      employeeName: user?.name ?? '',
      role: user?.role ?? 'employee',
      billable: Boolean(user?.billable),
      period: resolvedPeriod,
      hours: money(hours),
      payRate,
      currency: (user?.currency as SupportedCurrencyCode) ?? DEFAULT_CURRENCY,
      gross: money(hours * payRate),
      status,
    })
  }

  // Deterministic ordering: highest gross first, then name, so the UI is stable.
  rows.sort((a, b) => b.gross - a.gross || a.employeeName.localeCompare(b.employeeName))

  const rateChanges = await getRateChanges(resolvedPeriod)
  const totalGross = money(rows.reduce((sum, r) => sum + r.gross, 0))

  return { rows, rateChanges, totalGross, period: resolvedPeriod }
}

/** Pay-rate changes recorded inside the period, newest first. */
export async function getRateChanges(period: string): Promise<PayRateChange[]> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.PAYRATE_HISTORY)
    .find({ createdAt: { $gte: periodStart(period), $lt: periodStart(nextPeriod(period)) } })
    .sort({ createdAt: -1 })
    .toArray()

  return docs.map((doc: any) => ({
    id: String(doc._id),
    userId: doc.userId ? String(doc.userId) : '',
    changedBy: doc.changedBy ? String(doc.changedBy) : '',
    oldRate: doc.oldRate ?? null,
    newRate: doc.newRate ?? 0,
    currency: (doc.currency as SupportedCurrencyCode) ?? DEFAULT_CURRENCY,
    reason: doc.reason ?? undefined,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
  }))
}

function periodStart(period: string): Date {
  return new Date(`${period}-01T00:00:00.000Z`)
}

function nextPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * POST /payroll/close — freeze a period by writing one `payrolls` row per
 * approved timesheet (see the module note on the unique `timesheetId` index).
 * Idempotent: re-closing upserts on `timesheetId` rather than duplicating.
 */
export async function closePayroll(
  period: string,
  actorId: string,
): Promise<{ period: string; rowsWritten: number; totalGross: number }> {
  const db = await getDb()

  const timesheets = await db
    .collection(COLLECTIONS.TIMESHEETS)
    .find({ weekStart: { $regex: `^${period}` }, status: { $in: PAID_STATUSES } })
    .toArray()

  if (timesheets.length === 0) {
    const err: any = new Error(`No approved timesheets to close for ${period}`)
    err.code = 'PAYROLL_EMPTY'
    throw err
  }

  const userIds = [...new Set(timesheets.map((t: any) => String(t.userId ?? '')).filter(Boolean))]
  const users = userIds.length
    ? await db
        .collection(COLLECTIONS.USERS)
        .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
        .toArray()
    : []
  const userById = new Map(users.map((u: any) => [String(u._id), u]))

  const now = new Date()
  let rowsWritten = 0
  let totalGross = 0

  for (const sheet of timesheets as unknown as TimesheetDoc[]) {
    const userId = String(sheet.userId ?? '')
    const user: any = userById.get(userId)
    const payRate = user?.payRate ?? 0
    const hours = sheet.totalHours ?? 0
    const gross = money(hours * payRate)
    totalGross += gross

    await db.collection(COLLECTIONS.PAYROLLS).updateOne(
      { timesheetId: sheet._id },
      {
        $set: {
          // Platform field name for the same person, mirrored with userId.
          resourceId: sheet.userId ?? null,
          userId: sheet.userId ?? null,
          assignmentId: (sheet as any).assignmentId ?? null,
          projectId: sheet.projectId ?? null,
          timesheetId: sheet._id,
          period,
          grossHours: money(hours),
          grossPay: gross,
          currency: (user?.currency as SupportedCurrencyCode) ?? DEFAULT_CURRENCY,
          status: 'approved',
          closedBy: new ObjectId(actorId),
          closedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    )
    rowsWritten += 1
  }

  totalGross = money(totalGross)

  await createActivity({
    userId: actorId,
    description: `Payroll closed for ${period}: ${rowsWritten} row(s), gross ${totalGross}.`,
    entityType: 'payroll',
    entityId: period,
  })

  logger.info({ actorId, period, rowsWritten, totalGross }, 'payroll closed')

  return { period, rowsWritten, totalGross }
}