import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { getTimesheetById } from './timesheet.service.js'
import { getUserById } from './user.service.js'
import { createNotification } from './notification.service.js'
import { createActivity } from './activity.service.js'
import type { Timesheet } from './timesheet.service.js'

export interface ApprovalFilters {
  status?: string
  reviewerId?: string
}

export async function canReviewTimesheet(reviewerId: string, reviewerRole: string, reviewerIsSupervisor: boolean, timesheet: Timesheet): Promise<boolean> {
  if (reviewerRole === 'admin') return true
  if (reviewerRole === 'user' && reviewerIsSupervisor) {
    const db = await getDb()
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(timesheet.projectId) })
    if (!project) return false
    if (project.supervisorId.toString() === reviewerId) return true
    const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(timesheet.userId) })
    if (user?.supervisorId?.toString() === reviewerId) return true
    if (project.teamMemberIds.some((id: any) => id.toString() === reviewerId)) return true
    return false
  }
  return false
}

export async function getApprovals(filters?: ApprovalFilters): Promise<Timesheet[]> {
  const db = await getDb()
  const query: Record<string, unknown> = { status: 'pending' }
  if (filters?.reviewerId) {
    const reviewerId = new ObjectId(filters.reviewerId)
    const supervisedProjects = await db.collection(COLLECTIONS.PROJECTS).find({ supervisorId: reviewerId }).toArray()
    const supervisedProjectIds = new Set(supervisedProjects.map((p) => p._id.toString()))
    const supervisedUsers = await db.collection(COLLECTIONS.USERS).find({ supervisorId: reviewerId }).toArray()
    const supervisedUserIds = new Set(supervisedUsers.map((u) => u._id.toString()))
    const memberProjects = await db.collection(COLLECTIONS.PROJECTS).find({ teamMemberIds: reviewerId }).toArray()
    const memberProjectIds = new Set(memberProjects.map((p) => p._id.toString()))

    const timesheets = await db.collection(COLLECTIONS.TIMESHEETS).find({
      status: 'pending',
      $or: [
        { projectId: { $in: [...supervisedProjectIds, ...memberProjectIds].map((id) => new ObjectId(id)) } },
        { userId: { $in: [...supervisedUserIds, reviewerId.toString()].map((id) => new ObjectId(id)) } },
      ],
    }).toArray()
    return timesheets.map((t) => ({
      id: t._id.toString(),
      userId: t.userId.toString(),
      projectId: t.projectId.toString(),
      weekStart: t.weekStart,
      entries: t.entries,
      notes: t.notes,
      regularHours: t.regularHours,
      overtimeHours: t.overtimeHours,
      totalHours: t.totalHours,
      status: t.status,
      submittedAt: t.submittedAt,
      review: t.review,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }))
  }
  const timesheets = await db.collection(COLLECTIONS.TIMESHEETS).find(query).toArray()
  return timesheets.map((t) => ({
    id: t._id.toString(),
    userId: t.userId.toString(),
    projectId: t.projectId.toString(),
    weekStart: t.weekStart,
    entries: t.entries,
    notes: t.notes,
    regularHours: t.regularHours,
    overtimeHours: t.overtimeHours,
    totalHours: t.totalHours,
    status: t.status,
    submittedAt: t.submittedAt,
    review: t.review,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }))
}

export async function approveTimesheet(timesheetId: string, reviewerId: string): Promise<Timesheet | null> {
  const db = await getDb()
  const timesheet = await getTimesheetById(timesheetId)
  if (!timesheet) return null
  if (timesheet.status !== 'pending') {
    throw new Error(`Cannot approve timesheet in ${timesheet.status} status`)
  }

  const reviewer = await getUserById(reviewerId)
  if (!reviewer) return null
  const allowed = await canReviewTimesheet(reviewerId, reviewer.role, reviewer.isSupervisor, timesheet)
  if (!allowed) {
    throw new Error('Not authorized to approve this timesheet')
  }

  const now = new Date()
  const review = {
    reviewedBy: reviewerId,
    reviewedAt: now,
  }

  const result = await db.collection(COLLECTIONS.TIMESHEETS).findOneAndUpdate(
    { _id: new ObjectId(timesheetId) },
    { $set: { status: 'approved', review, updatedAt: now } },
    { returnDocument: 'after' }
  )
  if (!result) return null
  const updated = result

  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(timesheet.projectId) })
  const projectName = project?.name || 'a project'
  const reviewerName = reviewer.name

  await createNotification({
    userId: timesheet.userId,
    type: 'approval',
    title: 'Timesheet Approved',
    message: `Your timesheet for ${projectName} has been approved by ${reviewerName}.`,
    relatedId: timesheetId,
  })

  await createActivity({
    userId: reviewerId,
    projectId: timesheet.projectId,
    timesheetId,
    description: `${reviewerName} approved a timesheet for ${projectName}.`,
  })

  return {
    id: updated._id.toString(),
    userId: updated.userId.toString(),
    projectId: updated.projectId.toString(),
    weekStart: updated.weekStart,
    entries: updated.entries,
    notes: updated.notes,
    regularHours: updated.regularHours,
    overtimeHours: updated.overtimeHours,
    totalHours: updated.totalHours,
    status: updated.status,
    submittedAt: updated.submittedAt,
    review: updated.review,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  }
}

export async function declineTimesheet(timesheetId: string, reviewerId: string, reason: string): Promise<Timesheet | null> {
  const db = await getDb()
  const timesheet = await getTimesheetById(timesheetId)
  if (!timesheet) return null
  if (timesheet.status !== 'pending') {
    throw new Error(`Cannot decline timesheet in ${timesheet.status} status`)
  }
  if (!reason || !reason.trim()) {
    throw new Error('Reason is required for declining')
  }

  const reviewer = await getUserById(reviewerId)
  if (!reviewer) return null
  const allowed = await canReviewTimesheet(reviewerId, reviewer.role, reviewer.isSupervisor, timesheet)
  if (!allowed) {
    throw new Error('Not authorized to decline this timesheet')
  }

  const now = new Date()
  const review = {
    reviewedBy: reviewerId,
    reviewedAt: now,
    reason: reason.trim(),
  }

  const result = await db.collection(COLLECTIONS.TIMESHEETS).findOneAndUpdate(
    { _id: new ObjectId(timesheetId) },
    { $set: { status: 'declined', review, updatedAt: now } },
    { returnDocument: 'after' }
  )
  if (!result) return null
  const updated = result

  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(timesheet.projectId) })
  const projectName = project?.name || 'a project'
  const reviewerName = reviewer.name

  await createNotification({
    userId: timesheet.userId,
    type: 'decline',
    title: 'Timesheet Declined',
    message: `Your timesheet for ${projectName} was declined by ${reviewerName}. Reason: ${reason.trim()}`,
    relatedId: timesheetId,
  })

  await createActivity({
    userId: reviewerId,
    projectId: timesheet.projectId,
    timesheetId,
    description: `${reviewerName} declined a timesheet for ${projectName}.`,
  })

  return {
    id: updated._id.toString(),
    userId: updated.userId.toString(),
    projectId: updated.projectId.toString(),
    weekStart: updated.weekStart,
    entries: updated.entries,
    notes: updated.notes,
    regularHours: updated.regularHours,
    overtimeHours: updated.overtimeHours,
    totalHours: updated.totalHours,
    status: updated.status,
    submittedAt: updated.submittedAt,
    review: updated.review,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  }
}
