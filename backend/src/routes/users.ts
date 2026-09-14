import { Router } from 'express'
import { listUsers, getUser, create, update, deactivate, activate, assignSupervisor, updateMyProfile } from '../controllers/user.controller.js'
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
  // QA M4: self-service profile update — any authenticated user can update
  // their own name/email/employeeId/department. Restricted schema omits
  // role/status/isSupervisor/supervisorId/password, which remain admin-only
  // via PATCH /:id above.
  router.patch('/me', updateMyProfile)
  router.post('/:id/deactivate', requireAdmin, deactivate)
  router.post('/:id/activate', requireAdmin, activate)
  router.patch('/:id/supervisor', requireUserManage, assignSupervisor)
  return router
}
