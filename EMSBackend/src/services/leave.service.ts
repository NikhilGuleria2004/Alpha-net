import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import { createNotification } from './notification.service.js'
import { LEAVE_TYPES } from '../schemas/leave.schema.js'
import type { CreateLeaveInput, LeaveRequest, LeaveStatus, LeaveType, LeaveTypeOption, ReviewLeaveInput } from '../types/leave.js'

/**
 * Canonical leave-type registry (§5.2). Stored in the `leave_types` collection so
 * HR can extend it later, but these six are always present — the collection is
 * the source of truth only when it has been seeded.
 */
const CANONICAL_LEAVE_TYPES: LeaveTypeOption[] = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'sick', label: 'Sick' },
  { value: 'personal', label: 'Personal' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
]

function dateToUTC(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`)
}

/**
 * Count leave days excluding weekends (§7.5 "computes days excl. weekends").
 * Inclusive of both endpoints, so a Mon-Wed request is 3 days.
 *
 * Returns 0 for a range made entirely of weekends, which the caller rejects as
 * an INVALID_RANGE rather than persisting a zero-day request.
 */
export function countLeaveDays(startDate: string, endDate: string): number {
  const start = dateToUTC(startDate)
  const end = dateToUTC(endDate)
  let days = 0
  for (let cursor = start; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) {
      days += 1
    }
  }
  return days
}

function dbToLeaveRequest(doc: Record<string, any>, employeeName: string): LeaveRequest {
  return {
    id: String(doc._id),
    userId: doc.userId ? String(doc.userId) : '',
    employeeName,
    type: doc.type as LeaveType,
    startDate: doc.startDate,
    endDate: doc.endDate,
    days: doc.days ?? 0,
    status: (doc.status as LeaveStatus) ?? 'pending',
    reason: doc.reason || undefined,
    submittedAt: doc.submittedAt ? new Date(doc.submittedAt).toISOString() : undefined,
    reviewedBy: doc.reviewedBy || undefined,
    reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt).toISOString() : undefined,
    note: doc.note || undefined,
  }
}

/**
 * Idempotently insert the canonical leave types. Uses $setOnInsert so an
 * operator-renamed label is never overwritten on restart. Called from
 * src/server.ts bootstrap; safe to call repeatedly.
 */
export async function seedLeaveTypes(): Promise<void> {
  try {
    const db = await getDb()
    const collection = db.collection(COLLECTIONS.LEAVE_TYPES)
    for (const option of CANONICAL_LEAVE_TYPES) {
      await collection.updateOne(
        { value: option.value },
        { $setOnInsert: { ...option, createdAt: new Date() } },
        { upsert: true },
      )
    }
    logger.info({ count: CANONICAL_LEAVE_TYPES.length }, 'leave types seeded')
  } catch (err) {
    // Non-fatal: getLeaveTypes() falls back to the canonical list.
    logger.warn({ err }, 'failed to seed leave types')
  }
}

/**
 * GET /leave/types — { types: [{ value, label }] }.
 * Falls back to the canonical list when the collection is empty so the endpoint
 * is correct on a cold database without writing on read.
 */
export async function getLeaveTypes(): Promise<{ types: LeaveTypeOption[] }> {
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.LEAVE_TYPES)
    .find({ value: { $in: [...LEAVE_TYPES] } })
    .sort({ value: 1 })
    .toArray()

  if (docs.length === 0) {
    return { types: CANONICAL_LEAVE_TYPES }
  }

  const seeded = new Map(docs.map((doc) => [doc.value as string, doc.label as string]))
  // Preserve the canonical ordering and guarantee every frontend-known value is
  // present even if the collection is only partially seeded.
  return {
    types: CANONICAL_LEAVE_TYPES.map((option) => ({
      value: option.value,
      label: seeded.get(option.value) ?? option.label,
    })),
  }
}

export interface LeaveListFilters {
  type?: string
  status?: string
  /** Only honoured for reviewers; employees are always scoped to themselves. */
  userId?: string
}

/**
 * GET /leave — self-list for employees, full list (optionally narrowed to the
 * pending queue) for hr/admin. A manager falls back to their own rows
 * because §6.2 grants them no leave-review capability.
 */
export async function listLeaveRequests(
  requesterId: string,
  requesterRole: string,
  filters: LeaveListFilters = {},
): Promise<{ requests: LeaveRequest[]; total: number }> {
  const db = await getDb()
  const isReviewer = requesterRole === 'admin' || requesterRole === 'hr'

  const query: Record<string, any> = {}
  if (!isReviewer) {
    query.userId = new ObjectId(requesterId)
  } else if (filters.userId) {
    query.userId = new ObjectId(filters.userId)
  }
  if (filters.type) {
    query.type = filters.type
  }
  if (filters.status) {
    query.status = filters.status
  }

  const docs = await db
    .collection(COLLECTIONS.LEAVE_REQUESTS)
    .find(query)
    .sort({ startDate: -1, createdAt: -1 })
    .toArray()
  const users = await resolveEmployeeNames(db, docs)

  return {
    requests: docs.map((doc: Record<string, any>) => dbToLeaveRequest(doc, users.get(String(doc.userId)) ?? '')),
    total: docs.length,
  }
}

/** Batch-resolve display names for a page of leave rows (one users query). */
async function resolveEmployeeNames(db: any, docs: Record<string, any>[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const ids = [...new Set(docs.map((doc) => String(doc.userId)))]
  const validIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  if (validIds.length === 0) {
    return names
  }
  const users = await db
    .collection(COLLECTIONS.USERS)
    .find({ _id: { $in: validIds } })
    .project({ name: 1 })
    .toArray()
  for (const user of users) {
    names.set(String(user._id), user.name ?? '')
  }
  return names
}

/**
 * POST /leave — creates a pending request for the caller. Days are computed
 * server-side and never accepted from the client.
 */
export async function createLeaveRequest(userId: string, input: CreateLeaveInput): Promise<LeaveRequest> {
  const db = await getDb()

  const days = countLeaveDays(input.startDate, input.endDate)
  if (days === 0) {
    const err: any = new Error('The selected range contains no working days')
    err.code = 'INVALID_RANGE'
    throw err
  }

  // Guard against a second overlapping pending/approved request.
  const overlap = await db.collection(COLLECTIONS.LEAVE_REQUESTS).findOne({
    userId: new ObjectId(userId),
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: input.endDate },
    endDate: { $gte: input.startDate },
  })
  if (overlap) {
    const err: any = new Error('An overlapping leave request already exists for these dates')
    err.code = 'LEAVE_OVERLAP'
    throw err
  }

  const now = new Date()
  const result = await db.collection(COLLECTIONS.LEAVE_REQUESTS).insertOne({
    userId: new ObjectId(userId),
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
    reason: input.reason ?? null,
    note: input.note ?? null,
    status: 'pending',
    submittedAt: now.toISOString(),
    createdAt: now,
    updatedAt: now,
  })

  await createActivity({
    userId,
    description: `Leave requested: ${input.type} ${input.startDate} -> ${input.endDate}`,
    entityType: 'leave_request',
    entityId: result.insertedId.toString(),
  })

  logger.info({ userId, type: input.type, days }, 'leave request created')

  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(userId) })
  return dbToLeaveRequest({ _id: result.insertedId, userId: new ObjectId(userId), ...input, days, status: 'pending', submittedAt: now.toISOString() }, user?.name ?? '')
}

/**
 * PATCH /leave/:id — hr/admin review. Sets reviewedBy/reviewedAt and notifies the
 * requester (§7.5 "sets reviewedBy/At + notifies requester").
 */
export async function reviewLeaveRequest(
  requestId: string,
  reviewerId: string,
  reviewerName: string,
  input: ReviewLeaveInput,
): Promise<LeaveRequest> {
  const db = await getDb()

  const requestOid = new ObjectId(requestId)
  const existing = await db.collection(COLLECTIONS.LEAVE_REQUESTS).findOne({ _id: requestOid })
  if (!existing) {
    const err: any = new Error('Leave request not found')
    err.code = 'NOT_FOUND'
    throw err
  }
  if (existing.status !== 'pending') {
    const err: any = new Error(`Leave request is already ${existing.status}`)
    err.code = 'ALREADY_REVIEWED'
    throw err
  }

  const now = new Date()
  await db.collection(COLLECTIONS.LEAVE_REQUESTS).updateOne(
    { _id: requestOid, status: 'pending' },
    {
      $set: {
        status: input.status,
        reviewedBy: reviewerName,
        reviewedAt: now.toISOString(),
        reviewNote: input.note ?? null,
        updatedAt: now,
      },
    },
  )

  await createActivity({
    userId: reviewerId,
    description: `Leave request ${input.status}: ${existing.type} ${existing.startDate} -> ${existing.endDate}`,
    entityType: 'leave_request',
    entityId: requestId,
  })

  await createNotification({
    userId: String(existing.userId),
    type: 'leave',
    title: `Leave ${input.status}`,
    message: `${reviewerName} ${input.status} your ${existing.type} leave for ${existing.startDate} → ${existing.endDate}.`,
    relatedId: requestId,
    link: '/me/leave',
  })

  logger.info({ requestId, reviewerId, status: input.status }, 'leave request reviewed')

  const requester = await db.collection(COLLECTIONS.USERS).findOne({ _id: existing.userId })
  return dbToLeaveRequest({ ...existing, status: input.status, reviewedBy: reviewerName, reviewedAt: now.toISOString() }, requester?.name ?? '')
}