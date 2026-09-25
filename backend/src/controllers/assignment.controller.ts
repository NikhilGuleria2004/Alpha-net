import { type Request, type Response } from 'express'
import { logger } from '../lib/logger.js'
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  terminateAssignmentSchema,
  assignmentListQuerySchema,
} from '../schemas/assignment.schema.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import {
  listAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  terminateAssignment,
  rolloverCompletedAssignments,
} from '../services/assignment.service.js'

// Flow Integration Phase 3 — Assignments controller (see /flowIntegration.md §5
// Phase 3). Writes are admin-only (enforced by requireAdmin in
// routes/assignments.ts). Reads expose pay rates, so a non-admin may only list
// their OWN assignments — everyone else goes through canAccessAssignment.

export async function listAssignmentsHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const filters = assignmentListQuerySchema.parse(req.query)
    // Pay rates are sensitive: a non-admin may only enumerate their own rows.
    if (req.user!.role !== 'admin' && filters.resourceId !== req.user!.userId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Assignment access denied' } })
    }
    const assignments = await listAssignments(filters)
    res.json({ assignments })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list assignments'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function getAssignmentHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const assignment = await getAssignmentById(req.params.id as string)
    if (!assignment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } })
    }
    res.json({ assignment })
  } catch (err) {
    logger.error({ err }, 'failed to get assignment')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function createAssignmentHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = createAssignmentSchema.parse(req.body)
    const assignment = await createAssignment(body, req.user!.userId)
    res.status(201).json({ assignment })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create assignment'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function updateAssignmentHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = updateAssignmentSchema.parse(req.body)
    const assignment = await updateAssignment(req.params.id as string, body)
    if (!assignment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } })
    }
    res.json({ assignment })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update assignment'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function terminateAssignmentHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = terminateAssignmentSchema.parse(req.body ?? {})
    const assignment = await terminateAssignment(req.params.id as string, body)
    if (!assignment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Assignment not found' } })
    }
    res.json({ assignment })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to terminate assignment'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

/**
 * Flow Integration Phase 8 (§5, item 3) — trigger for the assignment lifecycle
 * rollover: `active` assignments whose endDate has passed become `completed`.
 *
 * Cron secret is read fresh per call (never hoisted to a module-level import /
 * top-level destructure) so a missing env var can't crash at module load, and
 * every failure returns a status (no double-send/blank-catch fall-through):
 * missing secret → 500 (mirrors createWeeklyDraftsCron's CONFIG_ERROR wording);
 * bad secret → 401; method mismatch → 405; success → exactly one 200 JSON body.
 */
export async function rolloverAssignmentsCron(req: Request, res: Response) {
  // Mirrors timesheet createWeeklyDraftsCron contract exactly (flowIntegration.md
  // Phase 8 §5.3): 500 CONFIG_ERROR → 401 UNAUTHORIZED → try{200|500}. The route is
  // registered router.post('/cron/rollover') like every other cron endpoint, so any
  // non-POST never reaches this handler (Express 404s it) — only POST can trigger a
  // rollover (single-send guarantee by construction, not by an unreachable 405).
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || cronSecret.trim() === '') {
    return res.status(500).json({ error: { code: 'CONFIG_ERROR', message: 'CRON_SECRET is not configured' } })
  }
  const authHeader = req.headers.authorization
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid cron secret' } })
  }

  try {
    const result = await rolloverCompletedAssignments()
    return res.json(result)
  } catch (err) {
    logger.error({ err }, 'failed to roll over completed assignments')
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}
