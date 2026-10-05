import { Router } from 'express'
import type { Request, Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { validateBody } from '../middleware/validate.js'
import { createDepartmentSchema } from '../schemas/people.schema.js'
import { createDepartment, listDepartments } from '../services/people.service.js'

/**
 * `/api/v1/departments` — top-level, per the frozen contract (EMSBackend.md §7.4:
 * "GET /departments — auth — { departments }").
 *
 * The same handlers stay reachable at `/api/v1/employees/departments` because the
 * departments resource lives inside the HR/people router. EMSFrontend calls the
 * top-level path, so this mount is the one that matters; the alias under
 * `/employees` is kept for compatibility.
 */
export function departmentsRoutes(): Router {
  const router = Router()

  router.get('/', authenticate, requireRole('admin', 'hr'), async (_req: Request, res: Response) => {
    const result = await listDepartments()
    res.json(result)
  })

  router.post(
    '/',
    authenticate,
    requireRole('admin', 'hr'),
    validateBody(createDepartmentSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const { name } = req.body as { name: string }
      const result = await createDepartment(name, req.user!.userId)
      res.status(201).json(result)
    },
  )

  return router
}