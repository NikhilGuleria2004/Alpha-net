import { Router } from 'express'
import {
  createInvoiceHandler,
  getInvoiceHandler,
  listInvoicesHandler,
  updateInvoiceHandler,
  sendInvoiceHandler,
  getInvoicePdfHandler,
  payInvoiceHandler,
  voidInvoiceHandler,
} from '../controllers/invoice.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth.js'
import { requireAdminOrProjectAccess } from '../controllers/invoice.controller.js'

export function invoicesRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', requireAdminOrProjectAccess, listInvoicesHandler)
  router.get('/:id', requireAdminOrProjectAccess, getInvoiceHandler)
  router.get('/:id/pdf', requireAdmin, getInvoicePdfHandler)
  router.post('/', requireAdmin, createInvoiceHandler)
  router.patch('/:id', requireAdmin, updateInvoiceHandler)
  router.post('/:id/send', requireAdmin, sendInvoiceHandler)
  // Flow Integration Phase 5 — payment/void transitions (admin only).
  router.post('/:id/pay', requireAdmin, payInvoiceHandler)
  router.post('/:id/void', requireAdmin, voidInvoiceHandler)

  return router
}
