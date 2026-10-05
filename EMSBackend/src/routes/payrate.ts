import { Router } from 'express'
import type { Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { getPayrateHistory } from '../services/people.service.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

/**
 * `/api/v1/payrate/history` — top-level, per the frozen contract
 * (EMSBackend.md §4: "GET /payrate/history -> bare array PayRateHistoryEntry[]").
 *
 * The same handler stays reachable at `/api/v1/employees/payrate/history`; this
 * mount is the contract path and the one EMSFrontend calls.
 */
export function payrateRoutes(): Router {
  const router = Router()

  router.get(
    '/history',
    authenticate,
    requireRole('admin', 'hr'),
    async (req: AuthenticatedRequest, res: Response) => {
      const result = await getPayrateHistory((req.query?.userId as string) || undefined)
      res.json(result)
    },
  )

  return router
}