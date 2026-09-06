import { Router } from 'express'
import { hoursByProject, hoursByEmployee, overtime, timesheetStatus } from '../controllers/report.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

export function reportsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/hours-by-project', requireAdmin, hoursByProject)
  router.get('/hours-by-employee', requireAdmin, hoursByEmployee)
  router.get('/overtime', requireAdmin, overtime)
  router.get('/timesheet-status', requireAdmin, timesheetStatus)

  return router
}
