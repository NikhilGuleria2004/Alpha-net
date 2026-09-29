import { type Response } from 'express'
import { ObjectId } from 'mongodb'
import { logger } from '../lib/logger.js'
import { type AuthenticatedRequest } from '../middleware/auth.js'
import { canSuperviseUser } from '../middleware/access.js'
import {
  createDailyTimesheetSchema,
  updateDailyTimesheetSchema,
  queryDailyTimesheetSchema,
  compileDailyTimesheetSchema,
  getWeekStartFromDateString,
} from '../schemas/daily-timesheet.schema.js'
import {
  createDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
  getDailyEntryById,
  listDailyEntries,
} from '../services/daily-timesheet.service.js'
import { compileWeeklyTimesheet } from '../services/timesheet.service.js'

// ts.md Phase 4 — daily timesheet HTTP layer (mounted at
// /api/v1/timesheets/daily by app.ts, ahead of the weekly /api/v1/timesheets
// mount so `/daily` is never captured by the weekly `/:id` route).
//
// Service-layer errors carry human-readable messages rather than codes, so the
// handlers below map them onto the envelopes the rest of the API uses:
// "not found" → 404, "permission"/"not assigned" → 403, "locked" → 409,
// anything else → 400.

function respondMutationError(res: Response, err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback
  if (/not found/i.test(message)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message } })
  }
  if (/permission|not assigned/i.test(message)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message } })
  }
  if (/locked/i.test(message)) {
    return res.status(409).json({ error: { code: 'CONFLICT', message } })
  }
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
}

/**
 * GET /api/v1/timesheets/daily
 *
 * Query filters: `date`, `weekStart`, `startDate`, `endDate`, `projectId`,
 * `userId`, `weeklyTimesheetId`, `status`.
 *
 * Scoping (narrowing is always allowed, widening never):
 *  - admin: every user's entries; `?userId=` narrows to one.
 *  - supervisor: their own entries by default, plus `?userId=` for a direct
 *    report (`users.supervisorId`). An out-of-scope `userId` is a 403 rather
 *    than a silently empty list, so the caller learns the filter was rejected.
 *  - everyone else: their own entries only — any `userId` filter is ignored.
 */
export async function listDailyTimesheets(req: AuthenticatedRequest, res: Response) {
  try {
    const filters = queryDailyTimesheetSchema.parse(req.query)
    const { role, isSupervisor, userId: requestUserId } = req.user!

    if (filters.userId && !ObjectId.isValid(filters.userId)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'userId must be a valid id' } })
    }

    let effectiveUserId: string | undefined

    if (role === 'admin') {
      effectiveUserId = filters.userId
    } else if (filters.userId && filters.userId !== requestUserId) {
      const allowed = await canSuperviseUser(requestUserId, isSupervisor, filters.userId)
      if (!allowed) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: "Access denied to this user's daily timesheets" } })
      }
      effectiveUserId = filters.userId
    } else {
      // Regular users (and supervisors reading their own week) see themselves.
      effectiveUserId = requestUserId
    }

    const dailyTimesheets = await listDailyEntries({
      date: filters.date,
      weekStart: filters.weekStart,
      startDate: filters.startDate,
      endDate: filters.endDate,
      projectId: filters.projectId,
      userId: effectiveUserId,
      weeklyTimesheetId: filters.weeklyTimesheetId,
      status: filters.status,
    })

    res.json({ dailyTimesheets })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list daily timesheets'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/** GET /api/v1/timesheets/daily/:id — guarded by requireDailyTimesheetAccess. */
export async function getDailyTimesheet(req: AuthenticatedRequest, res: Response) {
  try {
    const dailyTimesheet = await getDailyEntryById(req.params.id as string)
    if (!dailyTimesheet) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Daily timesheet entry not found' } })
    }
    res.json({ dailyTimesheet })
  } catch (err) {
    logger.error({ err }, 'failed to get daily timesheet')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

/**
 * POST /api/v1/timesheets/daily
 *
 * Always creates the entry for the authenticated user. The service upserts on
 * the (userId, projectId, date, entryType) key, so re-posting the same day
 * updates it instead of erroring — a caller can never write time in someone
 * else's name.
 *
 * Phase 5: the shared error mapping applies here too, so refusing a day in a
 * submitted/approved week is reported as 409 CONFLICT (like every other locked
 * mutation) rather than as a validation error.
 */
export async function createDailyTimesheet(req: AuthenticatedRequest, res: Response) {
  try {
    const input = createDailyTimesheetSchema.parse(req.body)
    const created = await createDailyEntry(req.user!.userId, input)
    res.status(201).json({ dailyTimesheet: created })
  } catch (err) {
    respondMutationError(res, err, 'Failed to create daily timesheet entry')
  }
}

/** PATCH /api/v1/timesheets/daily/:id — owner-or-admin (requireDailyTimesheetEdit). */
export async function updateDailyTimesheet(req: AuthenticatedRequest, res: Response) {
  try {
    const updates = updateDailyTimesheetSchema.parse(req.body)
    const isAdmin = req.user!.role === 'admin'
    const updated = await updateDailyEntry(req.params.id as string, req.user!.userId, updates, isAdmin)
    res.json({ dailyTimesheet: updated })
  } catch (err) {
    respondMutationError(res, err, 'Failed to update daily timesheet entry')
  }
}

/** DELETE /api/v1/timesheets/daily/:id — owner-or-admin (requireDailyTimesheetEdit). */
export async function deleteDailyTimesheet(req: AuthenticatedRequest, res: Response) {
  try {
    const isAdmin = req.user!.role === 'admin'
    await deleteDailyEntry(req.params.id as string, req.user!.userId, isAdmin)
    res.status(204).end()
  } catch (err) {
    respondMutationError(res, err, 'Failed to delete daily timesheet entry')
  }
}

/**
 * POST /api/v1/timesheets/daily/compile
 *
 * Manual end-of-week freeze (ts.md 4.1): aggregates daily entries into the
 * parent weekly timesheet for `projectId` + `weekStart` (or the week containing
 * `date`). An admin may compile for any user, a supervisor only for a direct
 * report, everyone else only for themselves.
 */
export async function compileDailyTimesheets(req: AuthenticatedRequest, res: Response) {
  try {
    const input = compileDailyTimesheetSchema.parse(req.body ?? {})
    const actor = req.user!
    const targetUserId = input.userId ?? actor.userId

    if (targetUserId !== actor.userId) {
      const allowed =
        actor.role === 'admin' ||
        (await canSuperviseUser(actor.userId, actor.isSupervisor, targetUserId))
      if (!allowed) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: "Access denied to compile this user's daily timesheets" } })
      }
    }

    if (!ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'userId must be a valid id' } })
    }

    const weekStart = input.weekStart ?? getWeekStartFromDateString(input.date as string)
    const timesheet = await compileWeeklyTimesheet(targetUserId, input.projectId, weekStart)
    res.json({ timesheet })
  } catch (err) {
    // Expected Zod failures are a client concern, not an operational warning.
    if (!(err instanceof Error) || err.name !== 'ZodError') {
      logger.warn({ err }, 'failed to compile daily timesheets')
    }
    respondMutationError(res, err, 'Failed to compile daily timesheets')
  }
}
