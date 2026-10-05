import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { logger } from '../lib/logger.js'
import type { EmsNotification, EmsNotificationType, NotificationListResult } from '../types/system.js'

/**
 * Notifications (EMSBackend §7.8, task 7.3).
 *
 * Write side is fire-and-forget and shared with the platform; the read side is
 * EMS-only. The shared collection also carries legacy `body`/`link` columns —
 * `body` is dual-written with `message` and `link` with `relatedId`, but the
 * mapper only ever surfaces the frontend vocabulary so the bell and
 * `utils/notificationRoutes.ts` deep-links see one consistent shape.
 */

/** Bell cap — the frontend renders at most 50 rows. */
const MAX_NOTIFICATIONS = 50

const KNOWN_TYPES: EmsNotificationType[] = [
  'approval',
  'attendance',
  'onboarding',
  'assignment',
  'payrate',
  'document',
  'user',
]

export interface CreateNotificationInput {
  userId: string
  type: string
  title: string
  message: string
  read?: boolean
  relatedId?: string
  link?: string
}

export async function createNotification(input: CreateNotificationInput): Promise<{ id: string }> {
  try {
    const db = await getDb()
    const doc = {
      userId: new ObjectId(input.userId),
      type: input.type,
      title: input.title,
      body: input.message,
      message: input.message,
      read: input.read ?? false,
      relatedId: input.relatedId ? new ObjectId(input.relatedId) : null,
      link: input.link ?? null,
      createdAt: new Date(),
    }
    const result = await db.collection(COLLECTIONS.NOTIFICATIONS).insertOne(doc)
    return { id: result.insertedId.toString() }
  } catch (err) {
    logger.warn({ err, userId: input.userId }, 'failed to create notification')
    return { id: '' }
  }
}

function toNotification(doc: any): EmsNotification {
  // Legacy rows predate the `type` column; fall back rather than dropping them.
  const type = KNOWN_TYPES.includes(doc.type) ? doc.type : 'user'
  return {
    id: String(doc._id),
    userId: doc.userId ? String(doc.userId) : '',
    type,
    title: doc.title ?? '',
    message: doc.message ?? doc.body ?? '',
    read: Boolean(doc.read),
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
    ...(doc.relatedId ? { relatedId: String(doc.relatedId) } : {}),
  }
}

/**
 * GET /notifications — newest-first, capped at 50, with an `unreadCount` that
 * counts the WHOLE unread set (not just the visible page) so the bell badge
 * stays truthful once a user has more than 50 notifications.
 */
export async function listNotifications(userId: string): Promise<NotificationListResult> {
  const db = await getDb()
  const userOid = new ObjectId(userId)

  const [docs, unreadCount] = await Promise.all([
    db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .find({ userId: userOid })
      .sort({ createdAt: -1 })
      .limit(MAX_NOTIFICATIONS)
      .toArray(),
    db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({ userId: userOid, read: false }),
  ])

  return { notifications: docs.map(toNotification), unreadCount }
}

/**
 * PATCH /notifications/:id/read — self-scoped and idempotent: marking an
 * already-read notification succeeds again (a bell can fire twice for one row).
 * A row that does not exist, or belongs to someone else, returns `false` so the
 * caller can 404 without leaking whether the id is real.
 */
export async function markNotificationRead(id: string, userId: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false
  const db = await getDb()
  const userOid = new ObjectId(userId)
  const idOid = new ObjectId(id)

  const result = await db
    .collection(COLLECTIONS.NOTIFICATIONS)
    .updateOne({ _id: idOid, userId: userOid }, { $set: { read: true, readAt: new Date() } })

  if ((result.modifiedCount ?? 0) > 0) return true

  // modifiedCount 0 means it was already read OR the row is not the caller's.
  const existing = await db
    .collection(COLLECTIONS.NOTIFICATIONS)
    .findOne({ _id: idOid, userId: userOid }, { projection: { _id: 1 } })

  return existing !== null
}

/** POST /notifications/mark-all-read — self-scoped bulk clear. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const db = await getDb()
  const result = await db
    .collection(COLLECTIONS.NOTIFICATIONS)
    .updateMany({ userId: new ObjectId(userId), read: false }, { $set: { read: true, readAt: new Date() } })
  return result.modifiedCount ?? 0
}