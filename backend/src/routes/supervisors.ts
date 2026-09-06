import { Router } from 'express'
import { listSupervisors, supervisorUsers } from '../controllers/user.controller.js'
import { authenticate } from '../middleware/auth.js'

export function supervisorsRoutes() {
  const router = Router()
  router.use(authenticate)
  router.get('/', listSupervisors)
  router.get('/:id/users', supervisorUsers)
  return router
}
