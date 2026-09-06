import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { createNotification } from './notification.service.js'
import { createActivity } from './activity.service.js'
export type TimesheetStatus = 'draft' | 'pending' | 'approved' | 'declined' | 'withdrawn'

export interface TimesheetReview {
  reviewedBy: string
  reviewedAt: string
  reason?: string
}

export interface TimesheetEntry {
  id: string
  description: string
  entryType: 'regular' | 'overtime'
  hours: Record<string, number>
}

export interface SaveTimesheetInput {
  projectId: string
  weekStart: string
  entries: TimesheetEntry[]
  notes: string
}

export interface Timesheet {
  id: string
  userId: string
  projectId: string
  weekStart: string
  entries: TimesheetEntry[]
  notes: string
  regularHours: number
  overtimeHours: number
  totalHours: number
  status: TimesheetStatus
  submittedAt?: string
  review?: TimesheetReview
  createdAt: Date
  updatedAt: Date
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const MAX_DAILY_HOURS = 24

function toTimesheet(doc: any): Timesheet {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    projectId: doc.projectId.toString(),
    weekStart: doc.weekStart,
    entries: doc.entries.map((e: any) => ({
      id: e.id,
      description: e.description,
      entryType: e.entryType,
      hours: e.hours,
    })),
    notes: doc.notes,
    regularHours: doc.regularHours,
    overtimeHours: doc.overtimeHours,
    totalHours: doc.totalHours,
    status: doc.status,
    submittedAt: doc.submittedAt,
    review: doc.review,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function normalizeToMonday(dateStr: string): string {
  const date = new Date(dateStr)
  date.setUTCHours(0, 0, 0, 0)
  const day = date.getUTCDay()
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1)
  date.setUTCDate(diff)
  return date.toISOString().split('T')[0]
}

export function validateEntries(entries: TimesheetEntry[]): string[] {
  const errors: string[] = []
  for (const entry of entries) {
    if (entry.entryType === 'regular') {
      for (const day of ['sat', 'sun']) {
        const hours = entry.hours[day as keyof typeof entry.hours]
        if (hours > 0) {
          errors.push(`Regular entry "${entry.description}" has hours on ${day} (${hours}h). Regular entries must be Mon-Fri only.`)
        }
      }
    } else if (entry.entryType === 'overtime') {
      for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) {
        const hours = entry.hours[day as keyof typeof entry.hours]
        if (hours > 0) {
          errors.push(`Overtime entry "${entry.description}" has hours on ${day} (${hours}h). Overtime entries must be Sat-Sun only.`)
        }
      }
    }
    for (const day of DAYS) {
      const hours = entry.hours[day as keyof typeof entry.hours]
      if (!Number.isFinite(hours) || hours < 0) {
        errors.push(`Invalid hours for ${day}: must be a non-negative number.`)
      }
      if (hours > MAX_DAILY_HOURS) {
        errors.push(`Hours exceed daily maximum of ${MAX_DAILY_HOURS} for ${day}.`)
      }
    }
    if (entry.hours.mon + entry.hours.tue + entry.hours.wed + entry.hours.thu + entry.hours.fri + entry.hours.sat + entry.hours.sun > 0 && !entry.description.trim()) {
      errors.push('Description is required for entries with hours.')
    }
  }
  return errors
}

export function calcTotals(entries: TimesheetEntry[]): { regularHours: number; overtimeHours: number; totalHours: number } {
  let regularHours = 0
  let overtimeHours = 0
  for (const entry of entries) {
    if (entry.entryType === 'regular') {
      regularHours += entry.hours.mon + entry.hours.tue + entry.hours.wed + entry.hours.thu + entry.hours.fri
    } else {
      overtimeHours += entry.hours.sat + entry.hours.sun
    }
  }
  return { regularHours, overtimeHours, totalHours: regularHours + overtimeHours }
}

export async function getTimesheets(filters?: { userId?: string; projectId?: string; status?: string }): Promise<Timesheet[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (filters?.userId) query.userId = new ObjectId(filters.userId)
  if (filters?.projectId) query.projectId = new ObjectId(filters.projectId)
  if (filters?.status) query.status = filters.status

  const timesheets = await db.collection(COLLECTIONS.TIMESHEETS).find(query).toArray()
  return timesheets.map(toTimesheet)
}

export async function getTimesheetById(id: string): Promise<Timesheet | null> {
  const db = await getDb()
  const timesheet = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!timesheet) return null
  return toTimesheet(timesheet)
}

export async function createTimesheet(input: SaveTimesheetInput, authenticatedUserId: string): Promise<Timesheet> {
  const db = await getDb()

  const weekStart = normalizeToMonday(input.weekStart)
  const userId = authenticatedUserId

  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(input.projectId) })
  if (!project) {
    throw new Error('Project not found')
  }
  if (!project.teamMemberIds.some((id: any) => id.toString() === userId)) {
    throw new Error('User is not assigned to this project')
  }

  const existing = await db.collection(COLLECTIONS.TIMESHEETS).findOne({
    userId: new ObjectId(userId),
    projectId: new ObjectId(input.projectId),
    weekStart,
  })
  if (existing) {
    throw new Error('Timesheet already exists for this user, project, and week')
  }

  const validationErrors = validateEntries(input.entries)
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join('; '))
  }

  const totals = calcTotals(input.entries)
  if (totals.totalHours <= 0) {
    throw new Error('At least one hour is required before submission')
  }

  const now = new Date()
  const doc = {
    userId: new ObjectId(userId),
    projectId: new ObjectId(input.projectId),
    weekStart,
    entries: input.entries,
    notes: input.notes || '',
    regularHours: totals.regularHours,
    overtimeHours: totals.overtimeHours,
    totalHours: totals.totalHours,
    status: 'draft' as TimesheetStatus,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection(COLLECTIONS.TIMESHEETS).insertOne(doc)
  const created = toTimesheet({ ...doc, _id: result.insertedId })

  await createActivity({
    userId: created.userId,
    projectId: created.projectId,
    timesheetId: created.id,
    description: `Timesheet created for week ${created.weekStart}.`,
  })

  return created
}

export async function updateTimesheet(id: string, input: SaveTimesheetInput, authenticatedUserId: string): Promise<Timesheet | null> {
  const db = await getDb()
  const existing = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!existing) return null

  if (existing.userId.toString() !== authenticatedUserId) {
    throw new Error('Only the owner can modify this timesheet')
  }
  if (existing.status === 'pending' || existing.status === 'approved') {
    throw new Error(`Cannot modify timesheet in ${existing.status} status`)
  }

  const weekStart = normalizeToMonday(input.weekStart)
  const validationErrors = validateEntries(input.entries)
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join('; '))
  }

  const totals = calcTotals(input.entries)
  if (totals.totalHours <= 0) {
    throw new Error('At least one hour is required before submission')
  }

  const now = new Date()
  const update = {
    weekStart,
    entries: input.entries,
    notes: input.notes || '',
    regularHours: totals.regularHours,
    overtimeHours: totals.overtimeHours,
    totalHours: totals.totalHours,
    updatedAt: now,
  }

  const result = await db.collection(COLLECTIONS.TIMESHEETS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  )
  if (!result || !result.value) return null
  const updated = toTimesheet(result.value)

  await createActivity({
    userId: authenticatedUserId,
    projectId: updated.projectId,
    timesheetId: updated.id,
    description: `Timesheet for week ${updated.weekStart} was updated.`,
  })

  return updated
}

export async function submitTimesheet(id: string, authenticatedUserId: string): Promise<Timesheet | null> {
  const db = await getDb()
  const existing = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!existing) return null

  if (existing.userId.toString() !== authenticatedUserId) {
    throw new Error('Only the owner can submit this timesheet')
  }
  if (existing.status !== 'draft' && existing.status !== 'declined' && existing.status !== 'withdrawn') {
    throw new Error(`Cannot submit timesheet in ${existing.status} status`)
  }

  const validationErrors = validateEntries(existing.entries)
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join('; '))
  }
  if (existing.totalHours <= 0) {
    throw new Error('At least one hour is required before submission')
  }

  const now = new Date()
  const result = await db.collection(COLLECTIONS.TIMESHEETS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { status: 'pending', submittedAt: now, updatedAt: now } },
    { returnDocument: 'after' }
  )
  if (!result || !result.value) return null
  const updated = toTimesheet(result.value)

  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(updated.projectId) })
  const projectName = project?.name || 'a project'
  const owner = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(updated.userId) })
  const ownerName = owner?.name || 'A user'

  if (project?.supervisorId) {
    await createNotification({
      userId: project.supervisorId.toString(),
      type: 'submission',
      title: 'Timesheet Submitted for Review',
      message: `${ownerName} submitted a timesheet for ${projectName} (week of ${updated.weekStart}).`,
      relatedId: id,
    })
  }
  const teamMemberIds = project?.teamMemberIds || []
  for (const memberId of teamMemberIds) {
    const member = await db.collection(COLLECTIONS.USERS).findOne({ _id: memberId })
    if (member && member.isSupervisor && member._id.toString() !== project?.supervisorId?.toString()) {
      await createNotification({
        userId: member._id.toString(),
        type: 'submission',
        title: 'Timesheet Submitted for Review',
        message: `${ownerName} submitted a timesheet for ${projectName} (week of ${updated.weekStart}).`,
        relatedId: id,
      })
    }
  }

  await createActivity({
    userId: authenticatedUserId,
    projectId: updated.projectId,
    timesheetId: id,
    description: `${ownerName} submitted a timesheet for ${projectName}.`,
  })

  return updated
}

export async function withdrawTimesheet(id: string, authenticatedUserId: string, reason?: string): Promise<Timesheet | null> {
  const db = await getDb()
  const existing = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!existing) return null

  if (existing.userId.toString() !== authenticatedUserId) {
    throw new Error('Only the owner can withdraw this timesheet')
  }
  if (existing.status !== 'pending') {
    throw new Error(`Cannot withdraw timesheet in ${existing.status} status`)
  }

  const review: TimesheetReview = {
    reviewedBy: authenticatedUserId,
    reviewedAt: new Date().toISOString(),
    reason: reason || 'Withdrawn by owner',
  }

  const result = await db.collection(COLLECTIONS.TIMESHEETS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { status: 'withdrawn', review, updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!result || !result.value) return null
  const updated = toTimesheet(result.value)

  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(updated.projectId) })
  const projectName = project?.name || 'a project'
  const ownerName = (await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(updated.userId) }))?.name || 'A user'

  if (project?.supervisorId) {
    await createNotification({
      userId: project.supervisorId.toString(),
      type: 'withdrawal',
      title: 'Timesheet Withdrawn',
      message: `${ownerName} withdrew their timesheet for ${projectName} (week of ${updated.weekStart}).`,
      relatedId: id,
    })
  }
  const teamMemberIds = project?.teamMemberIds || []
  for (const memberId of teamMemberIds) {
    const member = await db.collection(COLLECTIONS.USERS).findOne({ _id: memberId })
    if (member && member.isSupervisor && member._id.toString() !== project?.supervisorId?.toString()) {
      await createNotification({
        userId: member._id.toString(),
        type: 'withdrawal',
        title: 'Timesheet Withdrawn',
        message: `${ownerName} withdrew their timesheet for ${projectName} (week of ${updated.weekStart}).`,
        relatedId: id,
      })
    }
  }

  await createActivity({
    userId: authenticatedUserId,
    projectId: updated.projectId,
    timesheetId: id,
    description: `${ownerName} withdrew a timesheet for ${projectName}.`,
  })

  return updated
}

export async function approveTimesheet(id: string, reviewerId: string): Promise<Timesheet | null> {
  const db = await getDb()
  const existing = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!existing) return null
  if (existing.status !== 'pending') {
    throw new Error(`Cannot approve timesheet in ${existing.status} status`)
  }

  const review: TimesheetReview = {
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
  }

  const result = await db.collection(COLLECTIONS.TIMESHEETS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { status: 'approved', review, updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!result || !result.value) return null
  return toTimesheet(result.value)
}

export async function declineTimesheet(id: string, reviewerId: string, reason: string): Promise<Timesheet | null> {
  const db = await getDb()
  const existing = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(id) })
  if (!existing) return null
  if (existing.status !== 'pending') {
    throw new Error(`Cannot decline timesheet in ${existing.status} status`)
  }
  if (!reason || !reason.trim()) {
    throw new Error('Reason is required for declining')
  }

  const review: TimesheetReview = {
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
    reason: reason.trim(),
  }

  const result = await db.collection(COLLECTIONS.TIMESHEETS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { status: 'declined', review, updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!result || !result.value) return null
  return toTimesheet(result.value)
}
