import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { validateQuery } from '../middleware/validate.js'
import { auditQuerySchema } from '../schemas/finance.schema.js'
import * as auditService from '../services/audit.service.js'

/**
 * GET /audit (EMSBackend §7.9) — admin only. Reads the shared append-only
 * `activities` collection that backs both this log and the dashboard's
 * `recentAudit` widget.
 */
export function auditRoutes() {
  const router = Router()

  router.use(authenticate, requireRole('admin'))

  router.get('/', validateQuery(auditQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
    const { entityType, entityId, page, limit } = req.query as unknown as {
      entityType?: string
      entityId?: string
      page?: number
      limit?: number
    }
    const result = await auditService.listAuditEvents({ entityType, entityId, page, limit })
    res.json(result)
  })

  return router
}