import { Router } from 'express'
import { login, me, logout, forgotPassword, resetPassword } from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.js'

export function authRoutes() {
  const router = Router()

  router.post('/login', login)
  router.get('/me', authenticate, me)
  router.post('/logout', authenticate, logout)
  router.post('/forgot-password', forgotPassword)
  router.post('/reset-password', resetPassword)

  return router
}
