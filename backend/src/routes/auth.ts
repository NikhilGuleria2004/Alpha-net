import { Router } from 'express'
import { login, me, refresh, logout, forgotPassword, resetPassword } from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.js'

export function authRoutes() {
  const router = Router()

  router.post('/login', login)
  router.post('/refresh', refresh)
  router.get('/me', authenticate, me)
  router.post('/logout', authenticate, logout)
  router.post('/forgot-password', forgotPassword)
  router.post('/reset-password', resetPassword)

  return router
}
