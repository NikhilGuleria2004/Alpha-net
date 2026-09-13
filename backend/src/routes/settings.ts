import { Router } from 'express'
import {
  getOrgSettingsHandler,
  putOrgSettings,
  getMyNotificationPrefs,
  putMyNotificationPrefs,
} from '../controllers/settings.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

export function settingsRoutes(): Router {
  const router = Router()

  // Org-wide settings (admin only)
  router.get('/', requireAdmin, getOrgSettingsHandler)
  router.put('/', requireAdmin, putOrgSettings)

  // Per-user notification preferences
  router.get('/me/notification-prefs', authenticate, getMyNotificationPrefs)
  router.put('/me/notification-prefs', authenticate, putMyNotificationPrefs)

  return router
}