import { type Response } from 'express'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { logger } from '../lib/logger.js'
import {
  insertInvoiceSchema,
  updateInvoiceSchema,
  invoiceListQuerySchema,
  sendInvoiceSchema,
  voidInvoiceSchema,
} from '../schemas/invoice.schema.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import { canAccessProject } from '../middleware/access.js'
import {
  createInvoice,
  getInvoice,
  listProjectInvoices,
  addVariableCosts,
  removeVariableCosts,
  updateInvoiceRate,
  sendInvoice,
  markInvoicePaid,
  invoiceVoid,
} from '../services/invoice.service.js'
import { buildInvoicePdf } from '../services/invoice-pdf.service.js'
import { getProjectById } from '../services/project.service.js'
import type { InvoiceStatus } from '../services/invoice.service.js'

export function requireAdminOrProjectAccess(req: AuthenticatedRequest, res: Response, next: (err?: unknown) => void): void {
  if (req.user?.role === 'admin') {
    next()
    return
  }
  const projectId: string = String(req.query.projectId ?? (req.params.projectId ?? req.params.id ?? ''))
  if (!projectId || !ObjectId.isValid(projectId)) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } })
    return
  }
  canAccessProject(req.user!.userId, req.user!.role, req.user!.isSupervisor, projectId)
    .then((hasAccess) => {
      if (!hasAccess) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } })
        return
      }
      next()
    })
    .catch(() => {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } })
    })
}

export async function createInvoiceHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = insertInvoiceSchema.parse(req.body)
    const db = await getDb()
    const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(req.user!.userId) })
    if (!user) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Admin user not found' } })
      return
    }
    const invoice = await createInvoice({
      projectId: body.projectId,
      weekStart: body.weekStart,
      hourlyRate: body.hourlyRate,
      // Phase 5: optional billing scope + approved-only override. The service
      // resolves the flag default when approvedOnly is undefined; explicit
      // `false` forces the legacy path (cutover rollback without a deploy).
      assignmentId: body.assignmentId,
      timesheetIds: body.timesheetIds,
      approvedOnly: body.approvedOnly,
      // Never trusted from the body — always the authenticated admin.
      adminUserId: req.user!.userId,
      adminUserName: user.name,
    })
    res.status(201).json({ invoice })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create invoice'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function getInvoiceHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const invoice = await getInvoice(req.params.id as string)
    if (!invoice) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } })
      return
    }
    res.json({ invoice })
  } catch (err) {
    logger.error({ err }, 'failed to get invoice')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function listInvoicesHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const query = invoiceListQuerySchema.parse(req.query) as {
      projectId?: string
      status?: InvoiceStatus
      from?: string
      to?: string
    }
    const invoices = await listProjectInvoices(query.projectId ?? '', {
      status: query.status,
      from: query.from,
      to: query.to,
    })
    res.json({ invoices })
  } catch (err) {
    logger.error({ err }, 'failed to list invoices')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function updateInvoiceHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = updateInvoiceSchema.parse(req.body)
    // Apply removals first, then additions, then the rate — one PATCH can do
    // all three and the response is the fully updated invoice.
    let invoice
    if (body.removeVariableCostIds?.length) {
      invoice = await removeVariableCosts(
        req.params.id as string,
        body.removeVariableCostIds,
        req.user!.userId,
      )
    }
    if (body.addVariableCosts?.length) {
      invoice = await addVariableCosts(
        req.params.id as string,
        body.addVariableCosts,
        req.user!.userId,
      )
    }
    if (body.hourlyRate !== undefined) {
      invoice = await updateInvoiceRate(
        req.params.id as string,
        body.hourlyRate,
        req.user!.userId,
      )
    }
    if (!invoice) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Nothing to update' } })
      return
    }
    res.json({ invoice })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update invoice'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function sendInvoiceHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const { to } = sendInvoiceSchema.parse(req.body ?? {})
    const invoice = await sendInvoice(req.params.id as string, req.user!.userId, to)
    res.json({ invoice })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send invoice'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/**
 * Flow Integration Phase 5 — POST /invoices/:id/pay (admin).
 * Marks a sent invoice paid (terminal). Payment terms are out of scope here;
 * this records that money was received.
 */
export async function payInvoiceHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const invoice = await markInvoicePaid(req.params.id as string, req.user!.userId)
    res.json({ invoice })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to mark invoice paid'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/**
 * Flow Integration Phase 5 — POST /invoices/:id/void (admin).
 * Voids a draft/sent invoice and RELEASES its reserved timesheets so they can
 * be billed again. The optional reason is stored verbatim for the audit trail.
 */
export async function voidInvoiceHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const { reason } = voidInvoiceSchema.parse(req.body ?? {})
    const invoice = await invoiceVoid(req.params.id as string, req.user!.userId, reason)
    res.json({ invoice })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to void invoice'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/**
 * GET /invoices/:id/pdf — renders the invoice as a PDF on the fly (nothing is
 * persisted, so the download always reflects the current invoice state).
 */
export async function getInvoicePdfHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const invoice = await getInvoice(req.params.id as string)
    if (!invoice) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } })
      return
    }

    // Best-effort enrichment from the project record (client name, SOW).
    let clientName: string | undefined
    let sowNumber: string | undefined
    try {
      const project = await getProjectById(invoice.projectId)
      clientName = project?.client ?? undefined
      sowNumber = project?.sowNumber ?? undefined
    } catch {
      // The invoice itself is enough to render a valid PDF.
    }

    const pdf = await buildInvoicePdf({
      invoice,
      clientName,
      sowNumber,
      issuedOn: invoice.sentAt ?? invoice.createdAt,
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    )
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(pdf)
  } catch (err) {
    logger.error({ err }, 'failed to render invoice pdf')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}
