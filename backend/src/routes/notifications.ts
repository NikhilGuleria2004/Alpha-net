import { Router } from 'express'
import { listNotifications, getUnreadCount, markAsRead, markAllAsRead, sendDeadline } from '../controllers/notification.controller.js'
import { authenticate } from '../middleware/auth.js'

export function notificationsRoutes() {
  const router = Router()

  // QA C3 fix: the deadline cron endpoint must NOT be behind `authenticate`
  // (JWT verification). It self-protects with `Bearer <CRON_SECRET>`. Mount it
  // first so a scheduler holding only CRON_SECRET can actually reach it.
  router.post('/cron/deadline', sendDeadline)

  router.use(authenticate)

  router.get('/', listNotifications)
  router.get('/unread-count', getUnreadCount)
  router.post('/:id/read', markAsRead)
  router.post('/read-all', markAllAsRead)

  return router
}
