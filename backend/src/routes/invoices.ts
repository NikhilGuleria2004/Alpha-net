import { Router } from 'express'
import {
  createInvoiceHandler,
  getInvoiceHandler,
  listInvoicesHandler,
  updateInvoiceHandler,
  updateInvoiceRatesHandler,
  sendInvoiceHandler,
  getInvoicePdfHandler,
  payInvoiceHandler,
  voidInvoiceHandler,
  updateLineRateHandler,
  previewBillableHandler,
} from '../controllers/invoice.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth.js'
import { requireAdminOrProjectAccess } from '../controllers/invoice.controller.js'

export function invoicesRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', requireAdminOrProjectAccess, listInvoicesHandler)
  // Flow Integration Phase 5 — read-only preview of the per-employee
  // breakdown the create flow would bill. Registered BEFORE the generic
  // `/:id` route (single-segment match) so `preview` is never captured as an
  // invoice id. Side-effect free: no reservation is written.
  router.get('/preview', requireAdminOrProjectAccess, previewBillableHandler)
  router.get('/:id', requireAdminOrProjectAccess, getInvoiceHandler)
  router.get('/:id/pdf', requireAdmin, getInvoicePdfHandler)
  router.post('/', requireAdmin, createInvoiceHandler)
  router.patch('/:id', requireAdmin, updateInvoiceHandler)
  router.post('/:id/send', requireAdmin, sendInvoiceHandler)
  // Flow Integration Phase 5 — payment/void transitions (admin only).
  router.post('/:id/pay', requireAdmin, payInvoiceHandler)
  router.post('/:id/void', requireAdmin, voidInvoiceHandler)
  // Flow Integration Phase 5 — per-employee rate override on a draft invoice.
  // Registered AFTER the static `/:id/pdf`/`/:id/send` mounts, and the generic
  // `/:id` route is a single-segment match so `lines` is never captured as an
  // invoice id.
  router.patch('/:id/lines/:timesheetId/rate', requireAdmin, updateLineRateHandler)
  // Phase 5 create/edit flow: atomic multi-line rate update (one row per
  // employee, expanded to that employee's timesheet ids by the caller).
  router.patch('/:id/rates', requireAdmin, updateInvoiceRatesHandler)

  return router
}
