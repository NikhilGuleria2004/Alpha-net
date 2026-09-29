import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { getWeekStartFromDateString } from '../schemas/daily-timesheet.schema.js'

// ts.md Phase 5 — Lock Cascading & Race-Condition Protections.
//
// Daily entries are children of a weekly timesheet: `compileWeeklyTimesheet`
// stamps `daily_timesheets.weeklyTimesheetId` on every day it aggregates
// (Phase 3). Once that week is submitted, a reviewer is looking at a frozen
// snapshot, so every child must stop moving until the review resolves:
//
//   submit / approve  → children frozen   (5.1/5.2)
//   decline / withdraw→ children released (5.3/5.4)
//
// Two design rules keep this safe:
//
//  1. The PARENT is the authority. Every mutation calls
//     `resolveDailyEntryLockState`, which re-reads the parent row instead of
//     trusting the child's cached `status`. A cascade that never ran (or ran
//     against a collection that was unavailable) therefore can never let a
//     frozen day be edited — it only leaves the child flag stale, and the next
//     write attempt repairs it.
//  2. Child writes are conditional on `status: 'draft'` (see
//     `updateDailyEntryIfUnlocked` / `deleteDailyEntryIfUnlocked`), so an
//     approval landing between a caller's read and its write turns that write
//     into a no-op instead of a lost update.
//
// This module deliberately depends on nothing but the db/collections/schema
// helpers, so approval.service, timesheet.service and daily-timesheet.service
// can all import it without a cycle.

/** Weekly statuses that freeze every child day (ts.md 5.1). */
const FROZEN_WEEKLY_STATUSES = ['pending', 'approved']

/** ts.md 5.1 — the rejection reported by every frozen mutation. */
export const CASCADE_LOCK_MESSAGE =
  'Cannot modify daily entry: associated weekly timesheet is submitted or locked'

/**
 * `mutable`            — the entry may be written.
 * `reopen-stale-lock`  — the entry still carries `status: 'locked'` although its
 *                        parent is editable again (a decline/withdraw cascade
 *                        that was missed, or pre-Phase-5 data): the parent wins,
 *                        so the stale flag is cleared as part of the write.
 * `frozen`             — the parent weekly timesheet is submitted/approved/locked.
 * `locked`             — the entry was locked directly, with no parent to appeal
 *                        to (legacy/admin lock), so it stays locked.
 */
export type DailyEntryLockState = 'mutable' | 'reopen-stale-lock' | 'frozen' | 'locked'

function asObjectId(value: any): ObjectId | null {
  if (value instanceof ObjectId) return value
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value)
  return null
}

/** True when a weekly timesheet is submitted, approved, or explicitly locked. */
export function isFrozenWeeklyTimesheet(timesheet: any): boolean {
  if (!timesheet) return false
  return timesheet.isLocked === true || FROZEN_WEEKLY_STATUSES.includes(timesheet.status)
}

/** The weekly timesheet a daily entry was compiled into, if it is linked yet. */
export async function getParentWeeklyTimesheet(entry: any): Promise<any | null> {
  const parentId = asObjectId(entry?.weeklyTimesheetId)
  if (!parentId) return null
  const db = await getDb()
  return db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: parentId })
}

/**
 * The `(userId, projectId, weekStart)` parent for a date — works for dates that
 * have no daily row yet (and for rows the compiler never managed to link), so a
 * brand-new day cannot be slipped into a week that is already under review.
 */
export async function getWeeklyTimesheetForDate(
  userId: any,
  projectId: any,
  date: string,
): Promise<any | null> {
  const ownerId = asObjectId(userId)
  const project = asObjectId(projectId)
  if (!ownerId || !project || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null
  }
  const db = await getDb()
  return db.collection(COLLECTIONS.TIMESHEETS).findOne({
    userId: ownerId,
    projectId: project,
    weekStart: getWeekStartFromDateString(date),
  })
}

/**
 * ts.md 5.1 — the single lock-state decision every daily mutation makes before
 * writing. The linked parent is consulted first; a row that was never linked
 * falls back to the week-level lookup so a submitted/approved week still
 * freezes it.
 */
export async function resolveDailyEntryLockState(entry: any): Promise<DailyEntryLockState> {
  if (!entry) return 'mutable'
  const linkedParent = await getParentWeeklyTimesheet(entry)
  const parent =
    linkedParent ?? (await getWeeklyTimesheetForDate(entry.userId, entry.projectId, entry.date))
  if (isFrozenWeeklyTimesheet(parent)) return 'frozen'
  if (entry.status !== 'locked') return 'mutable'
  // Only a day the cascade itself locked (one compiled into a parent that is
  // editable again) may be re-opened. An unlinked `status: 'locked'` is an
  // independent freeze — admin/legacy data — and stays honoured.
  return linkedParent ? 'reopen-stale-lock' : 'locked'
}

/**
 * Race-safe update: the row is written only while its own flag still reads
 * `'draft'`, so a `status: 'locked'` written by a submit/approve cascade between
 * the caller's read and this write turns the update into a no-op. Returns the
 * updated document, or `null` when the row was locked or removed in that window
 * (the caller reports {@link CASCADE_LOCK_MESSAGE}).
 */
export async function updateDailyEntryIfUnlocked(
  entryId: any,
  setFields: Record<string, any>,
  reopenStaleLock = false,
): Promise<any | null> {
  const id = asObjectId(entryId)
  if (!id) return null
  const db = await getDb()
  const filter: Record<string, any> = { _id: id }
  const update: Record<string, any> = { $set: { ...setFields } }
  if (reopenStaleLock) {
    update.$set.status = 'draft'
  } else {
    filter.status = 'draft'
  }
  return db
    .collection(COLLECTIONS.DAILY_TIMESHEETS)
    .findOneAndUpdate(filter, update, { returnDocument: 'after' })
}

/** Delete counterpart of {@link updateDailyEntryIfUnlocked}. */
export async function deleteDailyEntryIfUnlocked(
  entryId: any,
  reopenStaleLock = false,
): Promise<boolean> {
  const id = asObjectId(entryId)
  if (!id) return false
  const db = await getDb()
  const filter: Record<string, any> = { _id: id }
  if (!reopenStaleLock) filter.status = 'draft'
  const result = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).deleteOne(filter)
  return (result as any)?.deletedCount > 0
}

/**
 * Applies `status` to every day compiled into a weekly timesheet. Best-effort by
 * design: the parent status is what `resolveDailyEntryLockState` enforces, so a
 * failed cascade can never widen write access — it only leaves the child flag
 * stale for the next attempted write to repair.
 */
async function setChildStatuses(
  weeklyTimesheetId: any,
  status: 'draft' | 'locked',
): Promise<number> {
  const parentId = asObjectId(weeklyTimesheetId)
  if (!parentId) return 0
  try {
    const db = await getDb()
    const result = await db
      .collection(COLLECTIONS.DAILY_TIMESHEETS)
      .updateMany({ weeklyTimesheetId: parentId }, { $set: { status, updatedAt: new Date() } })
    return (result as any)?.modifiedCount ?? 0
  } catch (err) {
    logger.warn(
      { err, weeklyTimesheetId: parentId.toString(), status },
      'daily timesheet lock cascade failed',
    )
    return 0
  }
}

/** ts.md 5.2 — freeze every child of a weekly timesheet (idempotent). */
export function lockDailyEntriesForWeeklyTimesheet(weeklyTimesheetId: any): Promise<number> {
  return setChildStatuses(weeklyTimesheetId, 'locked')
}

/**
 * ts.md 5.3/5.4 — hand the children of a declined or withdrawn week back to
 * their owner so the entries can be corrected and re-compiled.
 */
export function unlockDailyEntriesForWeeklyTimesheet(weeklyTimesheetId: any): Promise<number> {
  return setChildStatuses(weeklyTimesheetId, 'draft')
}
