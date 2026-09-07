import { type Request, type Response } from 'express'
import { getNotificationsByUserId, markNotificationAsRead, markAllNotificationsAsRead, sendDeadlineNotifications, createNotification } from '../services/notification.service.js'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'

export async function listNotifications(req: AuthenticatedRequest, res: Response) {
  const notifications = await getNotificationsByUserId(req.user!.userId)
  res.json({ notifications })
}

export async function getUnreadCount(req: AuthenticatedRequest, res: Response) {
  const notifications = await getNotificationsByUserId(req.user!.userId)
  const unreadCount = notifications.filter((n) => !n.read).length
  res.json({ unreadCount })
}

export async function markAsRead(req: AuthenticatedRequest, res: Response) {
  const notification = await markNotificationAsRead(req.params.id as string)
  if (!notification) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } })
  }
  res.json({ success: true })
}

export async function markAllAsRead(req: AuthenticatedRequest, res: Response) {
  await markAllNotificationsAsRead(req.user!.userId)
  res.json({ success: true })
}

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const { userId, type, title, message, relatedId } = req.body
    if (!userId || !type || !title || !message) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'userId, type, title, and message are required' } })
    }
    const notification = await createNotification({
      userId,
      type,
      title,
      message,
      read: false,
      relatedId,
    })
    res.status(201).json({ notification })
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } })
  }
}

export async function sendDeadline(req: Request, res: Response) {
  const cronSecret = process.env.CRON_SECRET || 'change-me-in-production'
  const authHeader = req.headers.authorization
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } })
  }

  try {
    const sent = await sendDeadlineNotifications()
    res.json({ sent })
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } })
  }
}
