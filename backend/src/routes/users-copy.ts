import { Router } from 'express'
import { listUsers, getUser, create, update, deactivate, activate, assignSupervisor } from '../controllers/user.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

export default function usersRoutes() {
  const router = Router()
  router.use(authenticate)
  router.get('/', requireAdmin, listUsers)
  router.get('/:id', getUser)
  router.post('/', requireAdmin, create)
  router.patch('/:id', requireAdmin, update)
  router.post('/:id/deactivate', requireAdmin, deactivate)
  router.post('/:id/activate', requireAdmin, activate)
  router.patch('/:id/supervisor', requireAdmin, assignSupervisor)
  return router
}
