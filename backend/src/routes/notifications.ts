import { Router } from 'express'
import { listNotifications, getUnreadCount, markAsRead, markAllAsRead, sendDeadline } from '../controllers/notification.controller.js'
import { authenticate } from '../middleware/auth.js'

export function notificationsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', listNotifications)
  router.get('/unread-count', getUnreadCount)
  router.post('/:id/read', markAsRead)
  router.post('/read-all', markAllAsRead)
  router.post('/cron/deadline', sendDeadline)

  return router
}
