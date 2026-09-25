// Flow Integration Phase 5 — reconstruct per-timesheet invoice lines (see
// /flowIntegration.md §5 Phase 5, checklist 5.8).
//
// Legacy invoices (created before Phase 5) have NO `lines[]`/`billedTimesheetIds`
// — every dollar is untraceable to a timesheets._id. This backfills both from
// the Phase 4 assignment links WITHOUT touching any money:
//
//   • lines come from the project's timesheets inside the invoice's billing
//     span (weekStart…weekEnd) — the same span legacy createInvoice() billed —
//     with hours = billable Mon–Fri regular hours (the legacy rule);
//   • amounts are allocated PROPORTIONALLY to hours against the invoice's
//     existing fixedCost, rounded to cents, remainder on the largest line, so
//     Σ lines.amount === fixedCost to the cent (totals-preserving: diff 0 —
//     fixedCost/total/variable costs never move);
//   • `rate` snapshots assignment billRate when usable (>0), else the invoice
//     rate (`rateSource` records which); backfilled assignments carry
//     billRate: 0, treated as unset — never a silent $0 line;
//   • billedTimesheetIds reserves those timesheets for the double-bill guard
//     (the guard skips void invoices, so reserving them is harmless);
//   • `source: 'proportional'` marks every reconstructed line.
//
// Idempotent: invoices that already have `lines`, have zero billable hours in
// span, or fixedCost 0 are skipped — the second run updates 0 rows.
//
// Usage:
//   npx tsx src/scripts/backfill-invoice-lines.ts [--dry-run]
// Env: MONGODB_URI, MONGODB_DB_NAME (same as server).
import 'dotenv/config'
import { getDb, closeDb } from '../lib/mongodb.js'
import { COLLECTIONS, ensureIndexes } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

export interface BackfillInvoiceLinesResult {
  invoicesScanned: number
  pending: number
  updated: number
  skippedHasLines: number
  skippedNoHours: number
  /** Max |Σ lines.amount − fixedCost| observed (must be 0 — totals-preserving). */
  maxTotalsDiff: number
  dryRun: boolean
  errors: string[]
}

function asObjectId(value: unknown): ObjectId | undefined {
  if (value instanceof ObjectId) return value
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value)
  return undefined
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Billable = regular (not overtime) Mon–Fri hours — the exact legacy rule. */
const BILLABLE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const
function billableHoursOf(timesheet: any): number {
  let hours = 0
  for (const entry of timesheet?.entries ?? []) {
    if (entry?.entryType !== 'regular') continue
    for (const day of BILLABLE_DAYS) {
      hours += Number(entry.hours?.[day] ?? 0)
    }
  }
  return hours
}

/** Invoices with no `lines` key yet — i.e. created before Phase 5. */
const MISSING_LINES_QUERY: Record<string, unknown> = {
  $or: [{ lines: { $exists: false } }, { lines: null }],
}

export async function backfillInvoiceLines(
  opts?: { dryRun?: boolean },
): Promise<BackfillInvoiceLinesResult> {
  const dryRun = opts?.dryRun ?? process.argv.includes('--dry-run')
  const db = await getDb()
  const result: BackfillInvoiceLinesResult = {
    invoicesScanned: 0,
    pending: 0,
    updated: 0,
    skippedHasLines: 0,
    skippedNoHours: 0,
    maxTotalsDiff: 0,
    dryRun,
    errors: [],
  }

  const invoices = db.collection(COLLECTIONS.INVOICES)
  const timesheets = db.collection(COLLECTIONS.TIMESHEETS)

  result.invoicesScanned = await invoices.countDocuments({})
  const pending = await invoices.find(MISSING_LINES_QUERY).toArray()
  result.pending = pending.length

  for (const invoice of pending) {
    try {
      const projectId = asObjectId(invoice.projectId)
      if (!projectId) {
        result.skippedNoHours++
        result.errors.push(
          `invoice ${String(invoice._id)} has an invalid projectId; skipped`,
        )
        continue
      }

      // Same span legacy createInvoice() billed: the invoice's logged weeks.
      const spanned = await timesheets
        .find({
          projectId,
          weekStart: { $gte: invoice.weekStart, $lte: invoice.weekEnd },
        })
        .toArray()

      const rows = spanned
        .map((ts) => ({ ts, hours: billableHoursOf(ts) }))
        .filter((row) => row.hours > 0)
      const totalHours = rows.reduce((sum, row) => sum + row.hours, 0)

      if (totalHours <= 0 || !invoice.fixedCost) {
        // Nothing to reconstruct (or nothing was ever billed) — leave untouched.
        result.skippedNoHours++
        continue
      }

      // Snapshot assignment bill rates in one batch for this invoice's span.
      const assignmentIds = [
        ...new Set(
          rows
            .map((row) => row.ts.assignmentId)
            .filter(Boolean)
            .map((id: unknown) => String(id)),
        ),
      ]
      const rateByAssignment = new Map<string, number>()
      if (assignmentIds.length > 0) {
        const assignments = await db
          .collection(COLLECTIONS.ASSIGNMENTS)
          .find({ _id: { $in: assignmentIds.map((id) => new ObjectId(id)) } })
          .toArray()
        for (const assignment of assignments) {
          rateByAssignment.set(String(assignment._id), assignment.billRate)
        }
      }

      // Proportional allocation: hours-weighted share of the EXISTING
      // fixedCost, rounded to cents, remainder on the largest line. The
      // invoice's money never changes — only its explanation does.
      const fixedCost = round2(invoice.fixedCost)
      const amounts = rows.map((row) => round2((fixedCost * row.hours) / totalHours))
      let diff = round2(
        fixedCost - amounts.reduce((sum, amount) => sum + amount, 0),
      )
      if (diff !== 0) {
        let biggest = 0
        for (let i = 1; i < amounts.length; i += 1) {
          if (amounts[i] > amounts[biggest]) biggest = i
        }
        amounts[biggest] = round2(amounts[biggest] + diff)
        diff = round2(
          fixedCost - amounts.reduce((sum, amount) => sum + amount, 0),
        )
      }

      const lines = rows.map((row, i) => {
        const rawRate = row.ts.assignmentId
          ? rateByAssignment.get(String(row.ts.assignmentId))
          : undefined
        const captured = typeof rawRate === 'number' && rawRate > 0
        return {
          timesheetId: row.ts._id,
          assignmentId: asObjectId(row.ts.assignmentId),
          resourceId: asObjectId(row.ts.userId),
          weekStart: row.ts.weekStart,
          hours: row.hours,
          rate: captured ? rawRate : invoice.hourlyRate,
          amount: amounts[i],
          rateSource: captured ? ('assignment' as const) : ('invoice' as const),
          source: 'proportional' as const,
        }
      })

      result.maxTotalsDiff = Math.max(result.maxTotalsDiff, Math.abs(diff))

      if (!dryRun) {
        // Guard inside the write: never clobber an invoice that already has
        // lines (e.g. created through the approved-only path mid-run).
        await invoices.updateOne(
          { _id: invoice._id, ...MISSING_LINES_QUERY },
          {
            $set: {
              lines,
              billedTimesheetIds: lines.map((line) => line.timesheetId),
            },
          },
        )
      }
      result.updated++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`invoice ${String(invoice._id)}: ${msg}`)
    }
  }

  return result
}

const isMain = process.argv[1]?.endsWith('backfill-invoice-lines.ts') ?? false
if (isMain) {
  ensureIndexes()
    .then(() => backfillInvoiceLines())
    .then((r) => {
      console.log(
        `[backfill-invoice-lines] dryRun=${r.dryRun} invoicesScanned=${r.invoicesScanned} ` +
          `pending=${r.pending} updated=${r.updated} skippedHasLines=${r.skippedHasLines} ` +
          `skippedNoHours=${r.skippedNoHours} maxTotalsDiff=${r.maxTotalsDiff} errors=${r.errors.length}`,
      )
      for (const e of r.errors) console.error(`[backfill-invoice-lines] error: ${e}`)
      if (r.maxTotalsDiff !== 0) {
        console.error(
          `[backfill-invoice-lines] FATAL: totals diff ${r.maxTotalsDiff} !== 0 (totals-preserving violated)`,
        )
        process.exitCode = 1
      }
      return closeDb()
    })
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      console.error('[backfill-invoice-lines] fatal:', err)
      process.exit(1)
    })
}
