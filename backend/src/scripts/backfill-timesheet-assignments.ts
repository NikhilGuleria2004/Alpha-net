// Flow Integration Phase 4 — backfill timesheet→assignment links (see
// /flowIntegration.md §5 Phase 4).
//
// Every timesheet that has no `assignmentId` yet is linked to the ACTIVE
// assignment of its (userId, projectId) pair; when a pair somehow has several
// active assignments the earliest startDate wins (the same deterministic pick
// `getActiveAssignment()` makes). Rows whose pair has no assignment are skipped
// and logged — never guessed.
//
// Additive only: it `$set`s `assignmentId` and nothing else, so totals, status,
// timestamps and every legacy field stay untouched. Safe to re-run — the second
// run finds nothing missing and links 0 rows.
//
// Usage:
//   npx tsx src/scripts/backfill-timesheet-assignments.ts [--dry-run]
// Env: MONGODB_URI, MONGODB_DB_NAME (same as server).
import 'dotenv/config'
import { getDb, closeDb } from '../lib/mongodb.js'
import { COLLECTIONS, ensureIndexes } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

export interface BackfillTimesheetAssignmentsResult {
  timesheetsScanned: number
  missingLink: number
  linked: number
  skippedNoAssignment: number
  dryRun: boolean
  errors: string[]
}

function asObjectId(value: unknown): ObjectId | undefined {
  if (value instanceof ObjectId) return value
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value)
  return undefined
}

/** `assignmentId` absent OR null (legacy rows) — the same definition the service uses. */
const MISSING_LINK_QUERY: Record<string, unknown> = {
  $or: [{ assignmentId: { $exists: false } }, { assignmentId: null }],
}

export async function backfillTimesheetAssignments(
  opts?: { dryRun?: boolean },
): Promise<BackfillTimesheetAssignmentsResult> {
  const dryRun = opts?.dryRun ?? process.argv.includes('--dry-run')
  const db = await getDb()
  const result: BackfillTimesheetAssignmentsResult = {
    timesheetsScanned: 0,
    missingLink: 0,
    linked: 0,
    skippedNoAssignment: 0,
    dryRun,
    errors: [],
  }

  const timesheets = db.collection(COLLECTIONS.TIMESHEETS)
  const assignments = db.collection(COLLECTIONS.ASSIGNMENTS)

  result.timesheetsScanned = await timesheets.countDocuments({})
  const pending = await timesheets.find(MISSING_LINK_QUERY).toArray()
  result.missingLink = pending.length

  for (const ts of pending) {
    try {
      const resourceId = asObjectId(ts.userId)
      const projectId = asObjectId(ts.projectId)
      if (!resourceId || !projectId) {
        result.skippedNoAssignment++
        result.errors.push(`timesheet ${ts._id.toString()} has an invalid userId/projectId; skipped`)
        continue
      }

      const active = await assignments
        .find({ resourceId, projectId, status: 'active' })
        .sort({ startDate: 1 })
        .limit(1)
        .toArray()
      if (!active.length) {
        result.skippedNoAssignment++
        continue
      }

      if (!dryRun) {
        // Re-assert the missing-link guard inside the write: a timesheet created
        // concurrently with a link already set is never overwritten.
        await timesheets.updateOne(
          { _id: ts._id, ...MISSING_LINK_QUERY },
          { $set: { assignmentId: active[0]._id } },
        )
      }
      result.linked++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`timesheet ${ts._id.toString()}: ${msg}`)
    }
  }

  return result
}

const isMain = process.argv[1]?.endsWith('backfill-timesheet-assignments.ts') ?? false
if (isMain) {
  ensureIndexes()
    .then(() => backfillTimesheetAssignments())
    .then((r) => {
      console.log(
        `[backfill-timesheet-assignments] dryRun=${r.dryRun} timesheetsScanned=${r.timesheetsScanned} ` +
          `missingLink=${r.missingLink} linked=${r.linked} skippedNoAssignment=${r.skippedNoAssignment} ` +
          `errors=${r.errors.length}`,
      )
      for (const e of r.errors) console.error(`[backfill-timesheet-assignments] error: ${e}`)
      return closeDb()
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill-timesheet-assignments] fatal:', err)
      process.exit(1)
    })
}
