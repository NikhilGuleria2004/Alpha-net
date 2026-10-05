import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import * as notificationService from '../services/notification.service.js'

/**
 * GET /notifications, PATCH /notifications/:id/read, POST /notifications/mark-all-read
 * (EMSBackend §7.8). Every route is self-scoped — there is no capability gate,
 * because a bell only ever shows the caller's own rows.
 *
 * `/mark-all-read` is declared before `/:id/read`'s sibling patterns so it can
 * never be read as an id.
 */
export function notificationsRoutes() {
  const router = Router()

  router.use(authenticate)

  /** GET /notifications — newest-first, capped at 50, plus unreadCount. */
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    const result = await notificationService.listNotifications(req.user!.userId)
    res.json(result)
  })

  /** POST /notifications/mark-all-read — bulk clear. */
  router.post('/mark-all-read', async (req: AuthenticatedRequest, res: Response) => {
    await notificationService.markAllNotificationsRead(req.user!.userId)
    res.status(204).send()
  })

  /** PATCH /notifications/:id/read — idempotent; 404 for another user's row. */
  router.patch('/:id/read', async (req: AuthenticatedRequest, res: Response) => {
    const marked = await notificationService.markNotificationRead(
      String(req.params.id),
      req.user!.userId,
    )
    if (!marked) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } })
    }
    res.status(204).send()
  })

  return router
}