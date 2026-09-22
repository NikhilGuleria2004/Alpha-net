import { Router } from 'express'
import {
  createInvoiceHandler,
  getInvoiceHandler,
  listInvoicesHandler,
  updateInvoiceHandler,
  sendInvoiceHandler,
  getInvoicePdfHandler,
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

  return router
}
