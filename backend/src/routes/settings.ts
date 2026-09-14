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

  // QA A1: org settings previously mounted requireAdmin WITHOUT authenticate,
  // so req.user was never populated and every request — valid admin tokens
  // included — was rejected with 403 "Admin access required". The admin
  // Settings page could never load or save. Every other route file mounts
  // authenticate first (users.ts, reports.ts); this restores that pattern and
  // also gives unauthenticated callers the correct 401 instead of a misleading
  // 403.
  router.use(authenticate)

  // Org-wide settings (admin only)
  router.get('/', requireAdmin, getOrgSettingsHandler)
  router.put('/', requireAdmin, putOrgSettings)

  // Per-user notification preferences
  router.get('/me/notification-prefs', authenticate, getMyNotificationPrefs)
  router.put('/me/notification-prefs', authenticate, putMyNotificationPrefs)

  return router
}