import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireCapability } from '../middleware/access.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import { createProjectSchema, projectListQuerySchema, type CreateProjectInput } from '../schemas/commercial.schema.js'
import * as projectService from '../services/project.service.js'
import { logger } from '../lib/logger.js'

/**
 * GET|POST /projects, GET /projects/:id (EMSBackend §7.6).
 * `projects` is shared with the platform, so every write mirrors the legacy
 * `client` name string and `hourlyRate` (see project.service header).
 */
export function projectsRoutes() {
  const router = Router()

  router.use(authenticate, requireCapability('manageProjects'))

  /** GET /projects[?clientId=&status=] — { projects, total } */
  router.get('/', validateQuery(projectListQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
    const filters = req.query as { clientId?: string; status?: string }
    const result = await projectService.listProjects({ clientId: filters.clientId, status: filters.status })
    res.json(result)
  })

  /** POST /projects — duplicate sowNumber -> 409 CONFLICT. */
  router.post('/', validateBody(createProjectSchema), async (req: AuthenticatedRequest, res: Response) => {
    const input = req.body as CreateProjectInput
    try {
      const project = await projectService.createProject(input, req.user!.userId)
      res.status(201).json({ project })
    } catch (err) {
      const code = (err as any)?.code
      if (code === 'SOW_CONFLICT') {
        return res.status(409).json({ error: { code: 'CONFLICT', message: (err as Error).message } })
      }
      if (code === 'CLIENT_NOT_FOUND') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
      }
      logger.warn({ err }, 'project creation failed')
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create project' } })
    }
  })

  /** GET /projects/:id — { project, assignments, team, documents } */
  router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const detail = await projectService.getProjectDetail(String(req.params.id))
    if (!detail) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
    }
    res.json(detail)
  })

  return router
}