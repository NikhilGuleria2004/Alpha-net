import { type Request, type Response } from 'express'
import { getNotificationsByUserId, markNotificationAsRead, markAllNotificationsAsRead, sendDeadlineNotifications } from '../services/notification.service.js'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { listNotificationsQuery } from '../schemas/notification.schema.js'
import { logger } from '../lib/logger.js'

export async function listNotifications(req: AuthenticatedRequest, res: Response) {
  const parsed = listNotificationsQuery.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.flatten() } })
  }
  const { read, page, limit } = parsed.data
  const notifications = await getNotificationsByUserId(req.user!.userId, {
    read: read === 'true' ? true : read === 'false' ? false : undefined,
    page,
    limit,
  })
  res.json({ notifications })
}

export async function getUnreadCount(req: AuthenticatedRequest, res: Response) {
  const notifications = await getNotificationsByUserId(req.user!.userId, { read: false })
  res.json({ unreadCount: notifications.length })
}

export async function markAsRead(req: AuthenticatedRequest, res: Response) {
  const notification = await markNotificationAsRead(req.params.id as string, req.user!.userId)
  if (!notification) {
    // 404 (not 403) deliberately — it doesn't leak whether the notification
    // exists but belongs to someone else, or doesn't exist at all (S1).
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } })
  }
  res.json({ success: true })
}

export async function markAllAsRead(req: AuthenticatedRequest, res: Response) {
  await markAllNotificationsAsRead(req.user!.userId)
  res.json({ success: true })
}

export async function sendDeadline(req: Request, res: Response) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || cronSecret.trim() === '') {
    return res.status(500).json({ error: { code: 'CONFIG_ERROR', message: 'CRON_SECRET is not configured' } })
  }
  const authHeader = req.headers.authorization
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } })
  }

  try {
    const sent = await sendDeadlineNotifications()
    res.json({ sent })
  } catch (err) {
    logger.error({ err }, 'failed to send deadline notifications')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}
