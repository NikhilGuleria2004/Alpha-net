import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { validateBody } from '../middleware/validate.js'
import { logger } from '../lib/logger.js'
import {
  listEmployees,
  createEmployee,
  getEmployeeDetail,
  updateEmployee,
  listDepartments,
  createDepartment,
  getPayrateHistory,
  toEmsUser,
} from '../services/people.service.js'
import { createEmployeeSchema, updateEmployeeSchema, createDepartmentSchema } from '../schemas/people.schema.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import type { CreateEmployeeInput, UpdateEmployeeInput } from '../types/people.js'
import type { EmsUser } from '../types/auth.js'

export function peopleRoutes() {
  const router = Router()

  // ── Employees collection ─────────────────────────────────────
  router.get('/', authenticate, requireRole('admin', 'hr'), async (req: AuthenticatedRequest, res: Response) => {
    const result = await listEmployees({
      q: req.query?.q as string,
      department: req.query?.department as string,
      role: req.query?.role as string,
    })
    res.json(result)
  })

  router.post('/', authenticate, requireRole('admin', 'hr'), validateBody(createEmployeeSchema), async (req: AuthenticatedRequest, res: Response) => {
    const input = req.body as CreateEmployeeInput
    try {
      const result = await createEmployee(input, req.user!.userId)
      res.status(201).json(result)
    } catch (err: any) {
      if (err.code === 'BILLABLE_WITHOUT_RATE') {
        return res.status(400).json({ error: { code: 'BILLABLE_WITHOUT_RATE', message: err.message } })
      }
      logger.warn({ err }, 'employee creation failed')
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } })
    }
  })

  // ── Static sub-routes (must come before /:id to avoid shadowing) ──
  // NOTE: `/departments` and `/payrate/history` are ALSO mounted at their
  // contract paths (`/api/v1/departments`, `/api/v1/employees/payrate/history`)
  // — see routes/departments.ts. §7.4 freezes `GET /departments` as top-level and
  // EMSFrontend calls exactly that, so these aliases here are for compatibility
  // only and must not be the sole definition.
  router.get('/departments', authenticate, requireRole('admin', 'hr'), async (_req: AuthenticatedRequest, res: Response) => {
    const result = await listDepartments()
    res.json(result)
  })

  router.post('/departments', authenticate, requireRole('admin', 'hr'), validateBody(createDepartmentSchema), async (req: AuthenticatedRequest, res: Response) => {
    const { name } = req.body as { name: string }
    const result = await createDepartment(name, req.user!.userId)
    res.status(201).json(result)
  })

  router.get('/payrate/history', authenticate, requireRole('admin', 'hr'), async (req: AuthenticatedRequest, res: Response) => {
    const result = await getPayrateHistory((req.query?.userId as string) || undefined)
    res.json(result)
  })

  // ── Dynamic /:id routes ───────────────────────────────────────
  router.get('/:id', authenticate, requireRole('admin', 'hr'), async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params as { id: string }
    try {
      const result = await getEmployeeDetail(id)
      res.json(result)
    } catch (err: any) {
      if (err.message === 'Employee not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } })
      }
      logger.warn({ err }, 'employee detail failed')
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to fetch employee' } })
    }
  })

  router.patch('/:id', authenticate, requireRole('admin', 'hr'), validateBody(updateEmployeeSchema), async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params as { id: string }
    try {
      const db = await getDb()
      const allUsers = await db.collection(COLLECTIONS.USERS).find({ status: 'active' }).toArray()
      const allActiveUsers = allUsers.map((u: any) => toEmsUser(u))

      const requester: EmsUser = {
        id: req.user!.userId,
        name: '',
        email: '',
        role: req.user!.role as any,
        employeeId: '',
        status: req.user!.status as any,
        billable: req.user!.billable,
      } as EmsUser

      const result = await updateEmployee(id, req.body as UpdateEmployeeInput, requester, allActiveUsers)
      res.json(result)
    } catch (err: any) {
      if (err.code === 'BILLABLE_WITHOUT_RATE') {
        return res.status(400).json({ error: { code: 'BILLABLE_WITHOUT_RATE', message: err.message } })
      }
      if (err.code === 'LAST_ADMIN') {
        return res.status(400).json({ error: { code: 'LAST_ADMIN', message: err.message } })
      }
      if (err.message === 'Employee not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } })
      }
      logger.warn({ err }, 'employee update failed')
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } })
    }
  })

  return router
}
