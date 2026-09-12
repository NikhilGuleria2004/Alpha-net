import { Router } from 'express'
import { login, me, refresh, logout, register, forgotPassword, resetPassword } from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireTrustedCookieSource } from '../middleware/csrf.js'

export function authRoutes() {
  const router = Router()

  router.post('/login', login)
  router.post('/register', register)
  // The refresh cookie is SameSite=None (cross-origin frontends), so cookie-
  // trusting endpoints must verify the browser's Origin against FRONTEND_URL.
  router.post('/refresh', requireTrustedCookieSource, refresh)
  router.get('/me', authenticate, me)
  router.post('/logout', authenticate, requireTrustedCookieSource, logout)
  router.post('/forgot-password', forgotPassword)
  router.post('/reset-password', resetPassword)

  return router
}
