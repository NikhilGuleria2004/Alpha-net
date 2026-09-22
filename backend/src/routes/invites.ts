import { Router } from 'express'
import { createHandler, listHandler, redeemHandler, resendHandler, revokeHandler, getByTokenHandler } from '../controllers/invite.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth.js'

export function invitesRoutes() {
  const router = Router()

  // Public — no auth required for redeem
  router.post('/redeem', redeemHandler)
  router.get('/check-token', getByTokenHandler)

  // Admin endpoints
  router.use(authenticate)
  router.get('/', requireAdmin, listHandler)
  router.post('/', requireAdmin, createHandler)
  router.post('/resend', requireAdmin, resendHandler)
  router.post('/revoke', requireAdmin, revokeHandler)

  return router
}
