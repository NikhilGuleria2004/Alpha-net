import { type Response } from 'express'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { logger } from '../lib/logger.js'
import {
  insertInvoiceSchema,
  updateInvoiceSchema,
  updateInvoiceRatesSchema,
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
  updateLineRate,
  updateInvoiceRates,
  previewBillableTimesheets,
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
      // Phase 5 create flow: per-employee (resource-keyed) rate overrides
      // and inline variable costs. Never anything but the authenticated
      // admin's identity.
      lineRateOverrides: body.lineRateOverrides,
      variableCosts: body.variableCosts,
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
 * Flow Integration Phase 5 — GET /invoices/preview?projectId=&hourlyRate=
 *
 * Read-only preview of the per-employee breakdown the create flow would
 * bill. Reuses the approved-only collector so the UI and the eventual
 * invoice can never disagree: the lines, hours, rates, amounts, and the
 * per-employee `employees` aggregation returned here are exactly what
 * `createInvoice` would persist. The preview is side-effect free
 * (no reservation is written), so an admin can shop rates before committing.
 *
 * `lineRateOverrides` (query JSON, keyed by RESOURCE id) is applied the
 * same way the collector applies it at create time — expanded across the
 * employee's billable timesheets as `rateSource: 'manual'` overrides
 * folded into `fixedCost` — so the preview reflects the rates the admin
 * is typing.
 */
export async function previewBillableHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const projectId = String(req.query.projectId ?? '')
    if (!projectId || !ObjectId.isValid(projectId)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'projectId is required' } })
      return
    }
    const hourlyRate = Number(req.query.hourlyRate ?? 0)
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Hourly rate must be 0 or greater' } })
      return
    }
    const lineRateOverrides: Record<string, number> = {}
    const rawOverrides = req.query.lineRateOverrides
    if (typeof rawOverrides === 'string' && rawOverrides.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawOverrides) as Record<string, unknown>
        for (const [key, value] of Object.entries(parsed)) {
          const num = Number(value)
          if (typeof num === 'number' && Number.isFinite(num) && num >= 0) {
            lineRateOverrides[key] = num
          }
        }
      } catch {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'lineRateOverrides must be a JSON object' } })
        return
      }
    }
    const collection = await previewBillableTimesheets(projectId, {
      hourlyRate,
      lineRateOverrides,
    })
    res.json({
      lines: collection.lines,
      billableHours: collection.billableHours,
      fixedCost: collection.fixedCost,
      billedTimesheetIds: collection.billedTimesheetIds,
      employees: collection.employees,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to preview invoice'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/**
 * Flow Integration Phase 5 — PATCH /invoices/:id/lines/:timesheetId/rate (admin).
 *
 * Updates the rate on a single per-employee line of a draft invoice and
 * recomputes that line's amount plus the invoice's fixed cost + total. The
 * underlying assignment/timesheet records are never touched — this is an
 * invoice-level price decision, exactly like the top-level `hourlyRate`.
 */
export async function updateLineRateHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const rate = Number(req.body?.rate)
    if (!Number.isFinite(rate) || rate < 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Rate must be 0 or greater' } })
      return
    }
    const invoice = await updateLineRate(
      req.params.id as string,
      req.params.timesheetId as string,
      rate,
      req.user!.userId,
    )
    res.json({ invoice })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update line rate'
    if (/not found/i.test(message)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message } })
      return
    }
    if (/already sent|Cannot modify/i.test(message)) {
      res.status(400).json({ error: { code: 'CONFLICT', message } })
      return
    }
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/**
 * Flow Integration Phase 5 — PATCH /invoices/:id/rates (admin).
 *
 * Atomically updates the rate on several lines of a draft invoice
 * (the create/edit UI sends one row per employee, which the caller
 * expands to that employee's timesheet ids) and re-derives
 * fixedCost = Σ line amounts plus total in a single write.
 */
export async function updateInvoiceRatesHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = updateInvoiceRatesSchema.parse(req.body ?? {})
    const invoice = await updateInvoiceRates(
      req.params.id as string,
      body.rates,
      req.user!.userId,
    )
    res.json({ invoice })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update invoice rates'
    if (/not found/i.test(message)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message } })
      return
    }
    if (/already sent|Cannot modify/i.test(message)) {
      res.status(400).json({ error: { code: 'CONFLICT', message } })
      return
    }
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
