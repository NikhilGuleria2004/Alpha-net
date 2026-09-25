import { Router } from 'express'
import { hoursByProject, hoursByEmployee, overtime, timesheetStatus, margin } from '../controllers/report.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

export function reportsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/hours-by-project', requireAdmin, hoursByProject)
  router.get('/hours-by-employee', requireAdmin, hoursByEmployee)
  router.get('/overtime', requireAdmin, overtime)
  router.get('/timesheet-status', requireAdmin, timesheetStatus)

  // Phase 7 — read-only margin view (no money stored).
  router.get('/margin', requireAdmin, margin)

  return router
}
