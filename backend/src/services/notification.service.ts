import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  message: string
  read: boolean
  relatedId?: string
  createdAt: Date
}

export async function createNotification(input: {
  userId: string
  type: string
  title: string
  message: string
  read?: boolean
  relatedId?: string
}): Promise<Notification> {
  const db = await getDb()
  const now = new Date()
  const doc = {
    userId: new ObjectId(input.userId),
    type: input.type,
    title: input.title,
    message: input.message,
    read: input.read ?? false,
    relatedId: input.relatedId ? new ObjectId(input.relatedId) : null,
    createdAt: now,
  }
  const result = await db.collection(COLLECTIONS.NOTIFICATIONS).insertOne(doc)
  return {
    id: result.insertedId.toString(),
    userId: input.userId,
    type: doc.type,
    title: doc.title,
    message: doc.message,
    read: doc.read,
    relatedId: doc.relatedId?.toString(),
    createdAt: doc.createdAt,
  }
}

export async function getNotificationsByUserId(
  userId: string,
  filters?: { read?: boolean; page?: number; limit?: number }
): Promise<Notification[]> {
  const db = await getDb()
  const query: Record<string, unknown> = { userId: new ObjectId(userId) }
  if (filters?.read !== undefined) {
    query.read = filters.read
  }
  const skip = filters?.page && filters?.limit ? (filters.page - 1) * filters.limit : 0
  const limit = filters?.limit ?? 50
  const notifications = await db
    .collection(COLLECTIONS.NOTIFICATIONS)
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()
  return notifications.map((n) => ({
    id: n._id.toString(),
    userId: n.userId.toString(),
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    relatedId: n.relatedId?.toString(),
    createdAt: n.createdAt,
  }))
}

export async function markNotificationAsRead(id: string, userId: string): Promise<boolean> {
  const db = await getDb()
  // Ownership constraint prevents IDOR: a user can only mark their OWN
  // notification as read (QA_REPORT.md S1). A notification that exists but
  // belongs to someone else matches nothing → returns false → 404.
  const result = await db.collection(COLLECTIONS.NOTIFICATIONS).updateOne(
    { _id: new ObjectId(id), userId: new ObjectId(userId) },
    { $set: { read: true } }
  )
  return result.modifiedCount > 0
}

export async function markAllNotificationsAsRead(userId: string): Promise<boolean> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.NOTIFICATIONS).updateMany({ userId: new ObjectId(userId), read: false }, { $set: { read: true } })
  return result.modifiedCount > 0
}

export async function sendDeadlineNotifications(): Promise<number> {
  const db = await getDb()
  const now = new Date()
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  const projects = await db.collection(COLLECTIONS.PROJECTS).find({
    status: { $nin: ['completed', 'archived'] },
    deadline: { $lte: threeDaysFromNow, $gte: now },
  }).toArray()

  let sent = 0
  for (const project of projects) {
    const manager = await db.collection(COLLECTIONS.USERS).findOne({ _id: project.managerId })
    const supervisor = project.supervisorId ? await db.collection(COLLECTIONS.USERS).findOne({ _id: project.supervisorId }) : null

    const daysRemaining = Math.ceil((new Date(project.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (manager) {
      await createNotification({
        userId: manager._id.toString(),
        type: 'deadline',
        title: 'Project Deadline Approaching',
        message: `Project "${project.name}" deadline is in ${daysRemaining} day(s) (${project.deadline}).`,
        relatedId: project._id.toString(),
      })
      sent++
    }

    if (supervisor && supervisor._id.toString() !== manager?._id.toString()) {
      await createNotification({
        userId: supervisor._id.toString(),
        type: 'deadline',
        title: 'Project Deadline Approaching',
        message: `Project "${project.name}" deadline is in ${daysRemaining} day(s) (${project.deadline}).`,
        relatedId: project._id.toString(),
      })
      sent++
    }
  }

  return sent
}
