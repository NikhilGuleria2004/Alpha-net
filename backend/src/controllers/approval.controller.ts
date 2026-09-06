import { type Request, type Response } from 'express'
import { getApprovals, approveTimesheet, declineTimesheet } from '../services/approval.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { declineTimesheetSchema } from '../schemas/timesheet.schema.js'

export async function listApprovals(req: AuthenticatedRequest, res: Response) {
  try {
    const approvals = await getApprovals({
      reviewerId: req.user?.role === 'admin' ? undefined : req.user?.userId,
    })
    res.json({ approvals })
  } catch (err) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: (err as Error).message } })
  }
}

export async function approve(req: AuthenticatedRequest, res: Response) {
  try {
    const timesheet = await approveTimesheet(req.params.id as string, req.user!.userId)
    if (!timesheet) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Timesheet not found' } })
    }
    res.json({ timesheet })
  } catch (err) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: (err as Error).message } })
  }
}

export async function decline(req: AuthenticatedRequest, res: Response) {
  try {
    const { reason } = declineTimesheetSchema.parse(req.body)
    const timesheet = await declineTimesheet(req.params.id as string, req.user!.userId, reason)
    if (!timesheet) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Timesheet not found' } })
    }
    res.json({ timesheet })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to decline timesheet'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}
