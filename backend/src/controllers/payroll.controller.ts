import { type Response } from 'express'
import { logger } from '../lib/logger.js'
import {
  payrollListQuerySchema,
  previewPayrollQuerySchema,
  createPayrollSchema,
  voidPayrollSchema,
} from '../schemas/payroll.schema.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import {
  previewPayroll,
  createPayrollFromTimesheet,
  listPayrolls,
  getPayroll,
  markPayrollPaid,
  payrollVoid,
} from '../services/payroll.service.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

/**
 * Flow Integration Phase 6 — payroll controller (see /flowIntegration.md §5
 * Phase 6 step 4). Every handler is admin-only (the router enforces
 * requireAdmin); error shapes mirror the invoice controller.
 */

/** GET /payrolls — admin list with filters. */
export async function listPayrollsHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const query = payrollListQuerySchema.parse(req.query)
    const payrolls = await listPayrolls(query)
    res.json({ payrolls })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list payrolls'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/** GET /payrolls/preview?timesheetId= — pure calculation, never writes. */
export async function previewPayrollHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const query = previewPayrollQuerySchema.parse(req.query)
    const preview = await previewPayroll(query.timesheetId)
    res.json({ preview })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to preview payroll'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/** POST /payrolls/from-timesheet — create (idempotently) from an approved timesheet. */
export async function createPayrollFromTimesheetHandler(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const body = createPayrollSchema.parse(req.body)
    // Audit name comes from the authenticated admin, never from the body.
    const db = await getDb()
    const admin = await db
      .collection(COLLECTIONS.USERS)
      .findOne({ _id: new ObjectId(req.user!.userId) })
    if (!admin) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Admin user not found' } })
      return
    }
    const payroll = await createPayrollFromTimesheet(
      body.timesheetId,
      req.user!.userId,
      admin.name,
    )
    res.status(201).json({ payroll })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create payroll'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/** POST /payrolls/:id/pay — draft → paid (terminal). */
export async function payPayrollHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const payroll = await markPayrollPaid(req.params.id as string, req.user!.userId)
    res.json({ payroll })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to pay payroll'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/** POST /payrolls/:id/void — draft → void (revivable via re-create). */
export async function voidPayrollHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const { reason } = voidPayrollSchema.parse(req.body ?? {})
    const payroll = await payrollVoid(req.params.id as string, req.user!.userId, reason)
    res.json({ payroll })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to void payroll'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/** GET /payrolls/:id — single payroll fetch (admin). */
export async function getPayrollHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const payroll = await getPayroll(req.params.id as string)
    if (!payroll) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Payroll not found' } })
      return
    }
    res.json({ payroll })
  } catch (err) {
    logger.error({ err }, 'failed to get payroll')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}