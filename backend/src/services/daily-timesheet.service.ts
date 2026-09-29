import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { getActiveAssignment } from './assignment.service.js'
import {
  getDayOfWeekFromDateString,
  getWeekStartFromDateString,
  type DayOfWeek,
} from '../schemas/daily-timesheet.schema.js'
import { compileWeeklyTimesheet } from './timesheet.service.js'
import {
  CASCADE_LOCK_MESSAGE,
  deleteDailyEntryIfUnlocked,
  getWeeklyTimesheetForDate,
  isFrozenWeeklyTimesheet,
  resolveDailyEntryLockState,
  updateDailyEntryIfUnlocked,
} from './daily-timesheet-lock.service.js'

/**
 * Rejections for a day that was locked directly rather than by its parent
 * (kept operation-specific so the message matches the request that failed).
 */
const LOCKED_UPDATE_MESSAGE = 'Cannot modify a locked daily timesheet entry'
const LOCKED_DELETE_MESSAGE = 'Cannot delete a locked daily timesheet entry'

export type DailyTimesheetStatus = 'draft' | 'locked'

export interface DailyTimesheet {
  id: string
  userId: string
  projectId: string
  assignmentId?: string
  weeklyTimesheetId?: string
  date: string // YYYY-MM-DD
  dayOfWeek: DayOfWeek
  hours: number // 0.25 to 24
  entryType: 'regular' | 'overtime'
  description: string
  status: DailyTimesheetStatus
  createdAt: Date
  updatedAt: Date
}

export interface CreateDailyTimesheetInput {
  projectId: string
  assignmentId?: string
  date: string // YYYY-MM-DD
  dayOfWeek?: DayOfWeek
  hours: number
  entryType?: 'regular' | 'overtime'
  description: string
}

export interface UpdateDailyTimesheetInput {
  hours?: number
  entryType?: 'regular' | 'overtime'
  description?: string
}

export interface DailyTimesheetQueryFilters {
  date?: string
  weekStart?: string
  startDate?: string
  endDate?: string
  projectId?: string
  userId?: string
  weeklyTimesheetId?: string
  status?: DailyTimesheetStatus
}

function toDailyTimesheet(doc: any): DailyTimesheet {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    projectId: doc.projectId.toString(),
    assignmentId: doc.assignmentId ? doc.assignmentId.toString() : undefined,
    weeklyTimesheetId: doc.weeklyTimesheetId ? doc.weeklyTimesheetId.toString() : undefined,
    date: doc.date,
    dayOfWeek: doc.dayOfWeek,
    hours: doc.hours,
    entryType: doc.entryType,
    description: doc.description,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/**
 * Validates project membership: checks if user is on teamMemberIds or has an active assignment on the project.
 */
async function validateProjectParticipation(userId: string, projectId: string): Promise<void> {
  const db = await getDb()
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(projectId) })
  if (!project) {
    throw new Error('Project not found')
  }

  // Check project team members
  const isMember = (project.teamMemberIds || []).some(
    (memberId: any) => memberId.toString() === userId
  )
  if (isMember) return

  // Check active assignment
  const activeAssignment = await getActiveAssignment(userId, projectId)
  if (activeAssignment) return

  throw new Error('User is not assigned to this project')
}

/**
 * Ensures that the sum of hours for a user on a single date does not exceed 24 hours.
 */
async function validateDailyHoursCap(
  userId: string,
  date: string,
  newHours: number,
  excludeEntryId?: string
): Promise<void> {
  const db = await getDb()
  const query: Record<string, any> = {
    userId: new ObjectId(userId),
    date,
  }
  if (excludeEntryId && ObjectId.isValid(excludeEntryId)) {
    query._id = { $ne: new ObjectId(excludeEntryId) }
  }

  const existingEntries = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).find(query).toArray()
  const currentTotal = existingEntries.reduce((sum: number, entry: any) => sum + (entry.hours || 0), 0)
  if (currentTotal + newHours > 24) {
    throw new Error(`Total daily hours cannot exceed 24 hours for ${date}. Current: ${currentTotal}h, attempting to add: ${newHours}h`)
  }
}

/**
 * Creates or upserts a daily timesheet entry.
 * Auto-links active assignment if assignmentId is not explicitly provided.
 */
export async function createDailyEntry(
  userId: string,
  input: CreateDailyTimesheetInput
): Promise<DailyTimesheet> {
  const db = await getDb()

  if (!ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID')
  }
  if (!ObjectId.isValid(input.projectId)) {
    throw new Error('Invalid project ID')
  }

  // Validate participation
  await validateProjectParticipation(userId, input.projectId)

  // Derive day of week
  const dayOfWeek = input.dayOfWeek || getDayOfWeekFromDateString(input.date)
  const entryType = input.entryType || 'regular'

  // Validate day-of-week vs entryType constraints
  if (entryType === 'regular' && (dayOfWeek === 'sat' || dayOfWeek === 'sun')) {
    throw new Error(`Regular hours are only allowed Monday through Friday (${dayOfWeek} is a weekend)`)
  }
  if (entryType === 'overtime' && dayOfWeek !== 'sat' && dayOfWeek !== 'sun') {
    throw new Error(`Overtime entries are only permitted on Saturday and Sunday (${dayOfWeek} is a weekday)`)
  }

  // Resolve assignmentId if omitted
  let assignmentId = input.assignmentId
  if (!assignmentId) {
    try {
      const active = await getActiveAssignment(userId, input.projectId)
      if (active) {
        assignmentId = active.id
      }
    } catch (err) {
      logger.warn({ err, userId, projectId: input.projectId }, 'failed to auto-link assignment for daily entry')
    }
  }

  // ts.md 5.1 — a day may not be added to (or edited inside) a week that is
  // already under review or approved: the reviewer must keep looking at the
  // snapshot they were given. This is the week-level twin of the per-entry
  // guard below, needed because a brand-new date has no `weeklyTimesheetId` to
  // follow yet.
  if (isFrozenWeeklyTimesheet(await getWeeklyTimesheetForDate(userId, input.projectId, input.date))) {
    throw new Error(CASCADE_LOCK_MESSAGE)
  }

  // Check for existing entry with compound unique key: (userId, projectId, date, entryType)
  const existing = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).findOne({
    userId: new ObjectId(userId),
    projectId: new ObjectId(input.projectId),
    date: input.date,
    entryType,
  })

  if (existing) {
    // ts.md 5.1 — the parent weekly timesheet decides; a stale child flag left
    // behind by a missed unlock is repaired instead of dead-ending the owner.
    const lockState = await resolveDailyEntryLockState(existing)
    if (lockState === 'frozen') throw new Error(CASCADE_LOCK_MESSAGE)
    if (lockState === 'locked') throw new Error(LOCKED_UPDATE_MESSAGE)
    await validateDailyHoursCap(userId, input.date, input.hours, existing._id.toString())

    const now = new Date()
    const updateDoc: Record<string, any> = {
      hours: input.hours,
      description: input.description.trim(),
      updatedAt: now,
    }
    if (assignmentId && ObjectId.isValid(assignmentId)) {
      updateDoc.assignmentId = new ObjectId(assignmentId)
    }

    // Race-safe: only written while the row still reads `draft`, so a submit or
    // approval that landed after the read above turns this into a no-op.
    const updated = await updateDailyEntryIfUnlocked(
      existing._id,
      updateDoc,
      lockState === 'reopen-stale-lock'
    )
    if (!updated) throw new Error(CASCADE_LOCK_MESSAGE)
    const resultTimesheet = toDailyTimesheet(updated)

    // Trigger auto-compile hook
    try {
      const weekStart = getWeekStartFromDateString(input.date)
      await compileWeeklyTimesheet(userId, input.projectId, weekStart)
    } catch (err) {
      logger.warn({ err, userId, projectId: input.projectId, date: input.date }, 'auto-compilation after daily upsert failed')
    }

    return resultTimesheet
  }

  // Check 24 hour limit for new entry
  await validateDailyHoursCap(userId, input.date, input.hours)

  const now = new Date()
  const doc: Record<string, any> = {
    userId: new ObjectId(userId),
    projectId: new ObjectId(input.projectId),
    date: input.date,
    dayOfWeek,
    hours: input.hours,
    entryType,
    description: input.description.trim(),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
  if (assignmentId && ObjectId.isValid(assignmentId)) {
    doc.assignmentId = new ObjectId(assignmentId)
  }

  const result = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).insertOne(doc as any)
  const resultTimesheet = toDailyTimesheet({ ...doc, _id: result.insertedId })

  // Trigger auto-compile hook
  try {
    const weekStart = getWeekStartFromDateString(input.date)
    await compileWeeklyTimesheet(userId, input.projectId, weekStart)
  } catch (err) {
    logger.warn({ err, userId, projectId: input.projectId, date: input.date }, 'auto-compilation after daily insert failed')
  }

  return resultTimesheet
}


/**
 * Updates an existing daily entry by ID.
 * Enforces ownership, unlock status, and daily hours maximum.
 */
export async function updateDailyEntry(
  id: string,
  userId: string,
  updates: UpdateDailyTimesheetInput,
  isAdmin = false
): Promise<DailyTimesheet> {
  const db = await getDb()

  if (!ObjectId.isValid(id)) {
    throw new Error('Invalid daily timesheet entry ID')
  }

  const existing = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!existing) {
    throw new Error('Daily timesheet entry not found')
  }

  if (!isAdmin && existing.userId.toString() !== userId) {
    throw new Error('You do not have permission to update this entry')
  }

  // ts.md 5.1 — a day is frozen while its weekly parent is under review or
  // approved, even if the day's own flag was never cascaded: the parent is the
  // authority here, so the state is re-resolved on every write.
  const lockState = await resolveDailyEntryLockState(existing)
  if (lockState === 'frozen') throw new Error(CASCADE_LOCK_MESSAGE)
  if (lockState === 'locked') throw new Error(LOCKED_UPDATE_MESSAGE)

  const newEntryType = updates.entryType || existing.entryType
  const dayOfWeek = existing.dayOfWeek

  if (updates.entryType && updates.entryType !== existing.entryType) {
    if (newEntryType === 'regular' && (dayOfWeek === 'sat' || dayOfWeek === 'sun')) {
      throw new Error(`Regular hours are only allowed Monday through Friday (${dayOfWeek} is a weekend)`)
    }
    if (newEntryType === 'overtime' && dayOfWeek !== 'sat' && dayOfWeek !== 'sun') {
      throw new Error(`Overtime entries are only permitted on Saturday and Sunday (${dayOfWeek} is a weekday)`)
    }
  }

  const newHours = updates.hours !== undefined ? updates.hours : existing.hours
  if (updates.hours !== undefined) {
    await validateDailyHoursCap(existing.userId.toString(), existing.date, newHours, existing._id.toString())
  }

  const now = new Date()
  const updateFields: Record<string, any> = {
    updatedAt: now,
  }
  if (updates.hours !== undefined) updateFields.hours = updates.hours
  if (updates.entryType !== undefined) updateFields.entryType = updates.entryType
  if (updates.description !== undefined) updateFields.description = updates.description.trim()

  // Race-safe: the row must still read `draft` for this write to land, so an
  // approval (or the submit that preceded it) racing this request wins.
  const result = await updateDailyEntryIfUnlocked(
    existing._id,
    updateFields,
    lockState === 'reopen-stale-lock'
  )
  if (!result) throw new Error(CASCADE_LOCK_MESSAGE)

  const updatedTimesheet = toDailyTimesheet(result)

  // Trigger auto-compile hook
  try {
    const weekStart = getWeekStartFromDateString(existing.date)
    await compileWeeklyTimesheet(existing.userId.toString(), existing.projectId.toString(), weekStart)
  } catch (err) {
    logger.warn({ err, userId: existing.userId.toString(), projectId: existing.projectId.toString(), date: existing.date }, 'auto-compilation after daily update failed')
  }

  return updatedTimesheet
}

/**
 * Deletes a daily entry by ID.
 * Enforces ownership and unlock status.
 */
export async function deleteDailyEntry(
  id: string,
  userId: string,
  isAdmin = false
): Promise<void> {
  const db = await getDb()

  if (!ObjectId.isValid(id)) {
    throw new Error('Invalid daily timesheet entry ID')
  }

  const existing = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!existing) {
    throw new Error('Daily timesheet entry not found')
  }

  if (!isAdmin && existing.userId.toString() !== userId) {
    throw new Error('You do not have permission to delete this entry')
  }

  // ts.md 5.1 — same parent-authority rule as the update path.
  const lockState = await resolveDailyEntryLockState(existing)
  if (lockState === 'frozen') throw new Error(CASCADE_LOCK_MESSAGE)
  if (lockState === 'locked') throw new Error(LOCKED_DELETE_MESSAGE)

  // Race-safe: a submit/approve that locked the row after the read above leaves
  // nothing to delete, and the caller reports the cascade rejection.
  const removed = await deleteDailyEntryIfUnlocked(existing._id, lockState === 'reopen-stale-lock')
  if (!removed) throw new Error(CASCADE_LOCK_MESSAGE)

  // Trigger auto-compile hook
  try {
    const weekStart = getWeekStartFromDateString(existing.date)
    await compileWeeklyTimesheet(existing.userId.toString(), existing.projectId.toString(), weekStart)
  } catch (err) {
    logger.warn({ err, userId: existing.userId.toString(), projectId: existing.projectId.toString(), date: existing.date }, 'auto-compilation after daily delete failed')
  }
}


/**
 * Retrieves a single daily entry by ID.
 */
export async function getDailyEntryById(id: string): Promise<DailyTimesheet | null> {
  const db = await getDb()
  if (!ObjectId.isValid(id)) return null
  const doc = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!doc) return null
  return toDailyTimesheet(doc)
}

/**
 * Queries daily entries for a specific date and user.
 */
export async function getDailyEntriesForDate(
  userId: string,
  date: string,
  projectId?: string
): Promise<DailyTimesheet[]> {
  const db = await getDb()
  const query: Record<string, any> = {
    userId: new ObjectId(userId),
    date,
  }
  if (projectId && ObjectId.isValid(projectId)) {
    query.projectId = new ObjectId(projectId)
  }

  const docs = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).find(query).sort({ createdAt: 1 }).toArray()
  return docs.map(toDailyTimesheet)
}

/**
 * Queries daily entries for a week starting on weekStart (Monday YYYY-MM-DD).
 */
export async function getDailyEntriesForWeek(
  userId: string,
  weekStart: string,
  projectId?: string
): Promise<DailyTimesheet[]> {
  const db = await getDb()

  // Calculate weekEnd (Sunday = weekStart + 6 days)
  const mondayDate = new Date(`${weekStart}T00:00:00.000Z`)
  if (isNaN(mondayDate.getTime())) {
    throw new Error('Invalid weekStart date')
  }
  const sundayDate = new Date(mondayDate)
  sundayDate.setUTCDate(sundayDate.getUTCDate() + 6)
  const weekEnd = sundayDate.toISOString().slice(0, 10)

  const query: Record<string, any> = {
    userId: new ObjectId(userId),
    date: { $gte: weekStart, $lte: weekEnd },
  }
  if (projectId && ObjectId.isValid(projectId)) {
    query.projectId = new ObjectId(projectId)
  }

  const docs = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).find(query).sort({ date: 1, createdAt: 1 }).toArray()
  return docs.map(toDailyTimesheet)
}

/**
 * Queries daily entries with flexible filters.
 */
export async function listDailyEntries(filters: DailyTimesheetQueryFilters): Promise<DailyTimesheet[]> {
  const db = await getDb()
  const query: Record<string, any> = {}

  if (filters.userId && ObjectId.isValid(filters.userId)) {
    query.userId = new ObjectId(filters.userId)
  }
  if (filters.projectId && ObjectId.isValid(filters.projectId)) {
    query.projectId = new ObjectId(filters.projectId)
  }
  if (filters.weeklyTimesheetId && ObjectId.isValid(filters.weeklyTimesheetId)) {
    query.weeklyTimesheetId = new ObjectId(filters.weeklyTimesheetId)
  }
  if (filters.status) {
    query.status = filters.status
  }
  if (filters.date) {
    query.date = filters.date
  } else if (filters.weekStart) {
    const mondayDate = new Date(`${filters.weekStart}T00:00:00.000Z`)
    if (!isNaN(mondayDate.getTime())) {
      const sundayDate = new Date(mondayDate)
      sundayDate.setUTCDate(sundayDate.getUTCDate() + 6)
      query.date = { $gte: filters.weekStart, $lte: sundayDate.toISOString().slice(0, 10) }
    }
  } else if (filters.startDate || filters.endDate) {
    query.date = {}
    if (filters.startDate) query.date.$gte = filters.startDate
    if (filters.endDate) query.date.$lte = filters.endDate
  }

  const docs = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).find(query).sort({ date: 1, createdAt: 1 }).toArray()
  return docs.map(toDailyTimesheet)
}

