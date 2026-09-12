import { type Request, type Response } from 'express'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { getTimesheets, getTimesheetById, createTimesheet, updateTimesheet, submitTimesheet, withdrawTimesheet } from '../services/timesheet.service.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { type AuthenticatedRequest } from '../middleware/auth.js'
import { createTimesheetSchema, updateTimesheetSchema } from '../schemas/timesheet.schema.js'
import { logger } from '../lib/logger.js'

export async function listTimesheets(req: AuthenticatedRequest, res: Response) {
  try {
    const { role, isSupervisor, userId: requestUserId } = req.user!

    let userIds: string[] | undefined

    if (role === 'admin') {
      userIds = undefined
    } else if (isSupervisor) {
      const db = await getDb()
      const subordinates = await db
        .collection(COLLECTIONS.USERS)
        .find({ supervisorId: new ObjectId(requestUserId) })
        .toArray()
      userIds = [requestUserId, ...subordinates.map((u) => u._id.toString())]
    } else {
      userIds = [requestUserId]
    }

    const timesheets = await getTimesheets({
      userIds,
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      weekStart: req.query.weekStart ? String(req.query.weekStart) : undefined,
    })
    res.json({ timesheets })
  } catch (err) {
    logger.error({ err }, 'failed to list timesheets')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function getTimesheet(req: AuthenticatedRequest, res: Response) {
  try {
    const timesheet = await getTimesheetById(req.params.id as string)
    if (!timesheet) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Timesheet not found' } })
    }
    const isAdmin = req.user?.role === 'admin'
    const isOwner = timesheet.userId === req.user?.userId
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
    }
    res.json({ timesheet })
  } catch (err) {
    logger.error({ err }, 'failed to get timesheet')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const input = createTimesheetSchema.parse(req.body)
    const timesheet = await createTimesheet({
      projectId: input.projectId,
      weekStart: input.weekStart,
      entries: input.entries,
      notes: input.notes || '',
    }, req.user!.userId)
    res.status(201).json({ timesheet })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create timesheet'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const input = updateTimesheetSchema.parse(req.body)
    const timesheet = await updateTimesheet(req.params.id as string, {
      projectId: input.projectId,
      weekStart: input.weekStart,
      entries: input.entries || [],
      notes: input.notes || '',
    }, req.user!.userId)
    if (!timesheet) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Timesheet not found' } })
    }
    res.json({ timesheet })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update timesheet'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function submit(req: AuthenticatedRequest, res: Response) {
  try {
    const timesheet = await submitTimesheet(req.params.id as string, req.user!.userId)
    if (!timesheet) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Timesheet not found' } })
    }
    res.json({ timesheet })
  } catch (err) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: (err as Error).message } })
  }
}

export async function withdraw(req: AuthenticatedRequest, res: Response) {
  try {
    const reason = req.body?.reason
    const timesheet = await withdrawTimesheet(req.params.id as string, req.user!.userId, reason)
    if (!timesheet) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Timesheet not found' } })
    }
    res.json({ timesheet })
  } catch (err) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: (err as Error).message } })
  }
}
