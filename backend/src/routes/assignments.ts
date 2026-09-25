import { Router } from 'express'
import {
  listAssignmentsHandler,
  getAssignmentHandler,
  createAssignmentHandler,
  updateAssignmentHandler,
  terminateAssignmentHandler,
  rolloverAssignmentsCron,
} from '../controllers/assignment.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { requireAssignmentAccess } from '../middleware/access.js'

// Flow Integration Phase 3 — Assignments routes (see /flowIntegration.md §5
// Phase 3). Mounted at /api/v1/assignments. Reads are guarded per-row by
// requireAssignmentAccess (admins pass); writes are admin-only.
export function assignmentsRoutes() {
  const router = Router()
  // Flow Integration Phase 8 (§5, item 3): assignment lifecycle rollover trigger
  // (active → completed once endDate has passed). Cron-protected (Bearer
  // CRON_SECRET), registered BEFORE authenticate so Vercel Cron can reach it
  // without a user session — same pattern as the weekly-drafts route.
  router.post('/cron/rollover', rolloverAssignmentsCron)
  router.use(authenticate)

  router.get('/', listAssignmentsHandler)
  router.get('/:id', requireAssignmentAccess, getAssignmentHandler)
  router.post('/', requireAdmin, createAssignmentHandler)
  router.patch('/:id', requireAdmin, updateAssignmentHandler)
  router.post('/:id/terminate', requireAdmin, terminateAssignmentHandler)

  return router
}
