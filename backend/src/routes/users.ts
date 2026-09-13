import { Router } from 'express'
import { listUsers, getUser, create, update, deactivate, activate, assignSupervisor } from '../controllers/user.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { requireUserManage } from '../middleware/access.js'

export function usersRoutes() {
  const router = Router()
  router.use(authenticate)
  // Scoping happens inside listUsers: admins get the full user list, everyone
  // else gets a scoped directory projection (QA C1 — non-admins must not 403
  // here or the app's initial data load fails entirely).
  router.get('/', listUsers)
  router.get('/:id', requireUserManage, getUser)
  router.post('/', requireAdmin, create)
  router.patch('/:id', requireUserManage, update)
  router.post('/:id/deactivate', requireAdmin, deactivate)
  router.post('/:id/activate', requireAdmin, activate)
  router.patch('/:id/supervisor', requireUserManage, assignSupervisor)
  return router
}
