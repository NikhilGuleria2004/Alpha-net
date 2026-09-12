import { Router } from 'express'
import { listSupervisors, supervisorUsers } from '../controllers/user.controller.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { type Response, type NextFunction } from 'express'

export function supervisorsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', requireAdmin, listSupervisors)
  router.get('/:id/users', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.user!.role === 'admin' || req.params.id === req.user!.userId) {
      return next()
    }
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
  }, supervisorUsers)
  return router
}
