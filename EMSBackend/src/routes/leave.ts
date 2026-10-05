import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import {
  createLeaveSchema,
  leaveListQuerySchema,
  reviewLeaveSchema,
  type CreateLeaveInput,
  type ReviewLeaveInput,
} from '../schemas/leave.schema.js'
import * as leaveService from '../services/leave.service.js'
import { resolveRequesterName } from './_shared.js'
import { logger } from '../lib/logger.js'

/**
 * GET /leave, POST /leave, PATCH /leave/:id (EMSBackend §7.5).
 * `/types` is registered before the review routes so it can never be shadowed.
 */
export function leaveRoutes() {
  const router = Router()

  router.use(authenticate)

  /** GET /leave/types — seeded enum for the request form. */
  router.get('/types', async (_req: AuthenticatedRequest, res: Response) => {
    const result = await leaveService.getLeaveTypes()
    res.json(result)
  })

  /**
   * GET /leave[?type=&status=] — self-list for employees; full list for
   * hr/admin. Query validation runs through the schema so an unknown `type`
   * is a 400 rather than a silently empty list.
   */
  router.get('/', validateQuery(leaveListQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!
    const filters = req.query as { type?: string; status?: string; userId?: string }
    const result = await leaveService.listLeaveRequests(user.userId, user.role, {
      type: filters.type,
      status: filters.status,
      userId: filters.userId,
    })
    res.json(result)
  })

  /** POST /leave — create a pending request; `days` is computed server-side. */
  router.post('/', validateBody(createLeaveSchema), async (req: AuthenticatedRequest, res: Response) => {
    const input = req.body as CreateLeaveInput
    try {
      const request = await leaveService.createLeaveRequest(req.user!.userId, input)
      res.status(201).json({ request })
    } catch (err) {
      const code = (err as any)?.code
      if (code === 'INVALID_RANGE') {
        return res.status(400).json({ error: { code: 'INVALID_RANGE', message: (err as Error).message } })
      }
      if (code === 'LEAVE_OVERLAP') {
        return res.status(409).json({ error: { code: 'LEAVE_OVERLAP', message: (err as Error).message } })
      }
      logger.warn({ err }, 'leave request creation failed')
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create leave request' } })
    }
  })

  /** PATCH /leave/:id — hr/admin review; notifies the requester. */
  router.patch(
    '/:id',
    requireRole('admin', 'hr'),
    validateBody(reviewLeaveSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const input = req.body as ReviewLeaveInput
      const reviewer = req.user!
      try {
        const reviewerName = await resolveRequesterName(reviewer.userId)
        const request = await leaveService.reviewLeaveRequest(String(req.params.id), reviewer.userId, reviewerName, input)
        res.json({ request })
      } catch (err) {
        const code = (err as any)?.code
        if (code === 'NOT_FOUND') {
          return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Leave request not found' } })
        }
        if (code === 'ALREADY_REVIEWED') {
          return res.status(409).json({ error: { code: 'ALREADY_REVIEWED', message: (err as Error).message } })
        }
        logger.warn({ err }, 'leave review failed')
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to review leave request' } })
      }
    },
  )

  return router
}