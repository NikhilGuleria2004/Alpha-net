import { Router, type Response, type NextFunction, type RequestHandler } from 'express'
import { logger } from '../lib/logger.js'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { getCachedSnapshot, setCachedSnapshot, getAdminDashboard, getHrDashboard, getManagerDashboard, getEmployeeDashboard } from '../lib/dashboard/aggregators.js'
import type { DashboardRole } from '../types/dashboard.js'

function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Requires role: ${allowedRoles.join(', ')}` } })
    }
    next()
  }
}

function dashboardHandler(role: DashboardRole, aggregator: (userId: string) => Promise<unknown>): RequestHandler {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    }
    const requesterId = user.userId

    const cached = getCachedSnapshot(role, requesterId)
    if (cached) {
      logger.debug({ role, requesterId }, 'dashboard cache hit')
      return res.json(cached)
    }

    try {
      const data = await aggregator(requesterId)
      setCachedSnapshot(role, requesterId, data)
      res.json(data)
    } catch (err) {
      next(err)
    }
  }
}

export function createDashboardRouter(): Router {
  const router = Router()

  router.get('/admin', authenticate, requireRole('admin', 'hr', 'manager'), dashboardHandler('admin', getAdminDashboard))
  router.get('/hr', authenticate, requireRole('admin', 'hr'), dashboardHandler('hr', getHrDashboard))
  router.get('/manager', authenticate, requireRole('admin', 'manager'), dashboardHandler('manager', getManagerDashboard))
  router.get('/employee', authenticate, requireRole('admin', 'hr', 'manager', 'employee'), dashboardHandler('employee', getEmployeeDashboard))

  return router
}
