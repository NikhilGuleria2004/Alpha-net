import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireCapability } from '../middleware/access.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import {
  assignmentListQuerySchema,
  createAssignmentSchema,
  type CreateAssignmentInput,
} from '../schemas/commercial.schema.js'
import * as assignmentService from '../services/assignment.service.js'
import { logger } from '../lib/logger.js'

/**
 * GET|POST /assignments, DELETE /assignments/:id, GET /assignments/demand
 * (EMSBackend §7.6). `/demand` is registered before any `/:id` route so it can
 * never be captured as an id.
 */
export function assignmentsRoutes() {
  const router = Router()

  router.use(authenticate)

  /** GET /assignments/demand — staffing gaps per project. */
  router.get(
    '/demand',
    requireCapability('manageProjects'),
    async (_req: AuthenticatedRequest, res: Response) => {
      const result = await assignmentService.getAssignmentDemand()
      res.json(result)
    },
  )

  /**
   * GET /assignments — admin and manager see all.
   */
  router.get('/', validateQuery(assignmentListQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
    const filters = req.query as { userId?: string; projectId?: string; status?: string }

    const result = await assignmentService.listAssignments(filters)
    res.json(result)
  })

  /** POST /assignments — overlap -> 409 ASSIGNMENT_OVERLAP; dual-writes the roster. */
  router.post('/', requireCapability('manageAssignments'), validateBody(createAssignmentSchema), async (req: AuthenticatedRequest, res: Response) => {
    const input = req.body as CreateAssignmentInput
    try {
      const assignment = await assignmentService.createAssignment(input, req.user!.userId)
      res.status(201).json({ assignment })
    } catch (err) {
      const code = (err as any)?.code
      if (code === 'ASSIGNMENT_OVERLAP') {
        return res.status(409).json({ error: { code: 'ASSIGNMENT_OVERLAP', message: (err as Error).message } })
      }
      if (code === 'USER_NOT_FOUND') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Employee not found' } })
      }
      if (code === 'PROJECT_NOT_FOUND') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
      }
      logger.warn({ err }, 'assignment creation failed')
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create assignment' } })
    }
  })

  /** DELETE /assignments/:id — terminate (204 + audit). */
  router.delete(
    '/:id',
    requireCapability('manageAssignments'),
    async (req: AuthenticatedRequest, res: Response) => {
      const terminated = await assignmentService.terminateAssignment(String(req.params.id), req.user!.userId)
      if (!terminated) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } })
      }
      res.status(204).send()
    },
  )

  return router
}