import { Router } from 'express'
import { listUsers, getUser, create, update, deactivate, activate, assignSupervisor } from '../controllers/user.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { requireUserManage } from '../middleware/access.js'

export function usersRoutes() {
  const router = Router()
  router.use(authenticate)
  router.get('/', listUsers)
  router.get('/:id', requireUserManage, getUser)
  router.post('/', requireAdmin, create)
  router.patch('/:id', requireUserManage, update)
  router.post('/:id/deactivate', requireAdmin, deactivate)
  router.post('/:id/activate', requireAdmin, activate)
  router.patch('/:id/supervisor', requireUserManage, assignSupervisor)
  return router
}
