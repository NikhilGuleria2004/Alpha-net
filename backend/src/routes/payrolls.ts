import { Router } from 'express'
import {
  listPayrollsHandler,
  previewPayrollHandler,
  createPayrollFromTimesheetHandler,
  payPayrollHandler,
  voidPayrollHandler,
  getPayrollHandler,
} from '../controllers/payroll.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

/**
 * Flow Integration Phase 6 — payroll routes (see /flowIntegration.md §5
 * Phase 6 step 4), mounted at /api/v1/payrolls. Pay data is admin-only by
 * design: no per-row access widening like invoices (payroll is a NEW domain
 * with no legacy reader).
 */
export function payrollsRoutes() {
  const router = Router()
  router.use(authenticate)

  // Static paths BEFORE /:id so they never match as an id.
  router.get('/', requireAdmin, listPayrollsHandler)
  router.get('/preview', requireAdmin, previewPayrollHandler)
  router.post('/from-timesheet', requireAdmin, createPayrollFromTimesheetHandler)
  router.get('/:id', requireAdmin, getPayrollHandler)
  router.post('/:id/pay', requireAdmin, payPayrollHandler)
  router.post('/:id/void', requireAdmin, voidPayrollHandler)

  return router
}