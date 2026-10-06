import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { validateBody } from '../middleware/validate.js'
import { logger } from '../lib/logger.js'
import {
  createOnboardingCandidate,
  getOnboardingPipeline,
  deleteOnboardingCandidate,
} from '../services/onboarding.service.js'
import { createOnboardingSchema } from '../schemas/people.schema.js'
import type { CreateOnboardingInput } from '../types/people.js'

export function onboardingRoutes() {
  const router = Router()

  router.get(
    '/pipeline',
    authenticate,
    requireRole('admin', 'hr'),
    async (_req: AuthenticatedRequest, res: Response) => {
      const result = await getOnboardingPipeline()
      res.json(result)
    },
  )

  router.post(
    '/',
    authenticate,
    requireRole('admin', 'hr'),
    validateBody(createOnboardingSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const input = req.body as CreateOnboardingInput
      try {
        const candidate = await createOnboardingCandidate(input, req.user!.userId)
        res.status(201).json({ candidate })
      } catch (err: any) {
        if (err.code === 'BILLABLE_WITHOUT_RATE') {
          return res.status(400).json({ error: { code: 'BILLABLE_WITHOUT_RATE', message: err.message } })
        }
        logger.warn({ err }, 'onboarding creation failed')
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } })
      }
    },
  )

  // DELETE /onboarding/:id — soft-delete a candidate (withdraw an invite).
  // admin/hr only. Refuses active (already-hired) candidates; frees the
  // email for re-invitation (create/getPipeline both exclude deletedAt).
  router.delete(
    '/:id',
    authenticate,
    requireRole('admin', 'hr'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const result = await deleteOnboardingCandidate(req.params.id as string, req.user!.userId)
        res.json({ ok: true, ...result })
      } catch (err: any) {
        const message = err instanceof Error ? err.message : 'Failed to delete candidate'
        if (message === 'Invalid candidate id') {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
        }
        if (message === 'Onboarding candidate not found') {
          return res.status(404).json({ error: { code: 'NOT_FOUND', message } })
        }
        if (message === 'Onboarding candidate already deleted') {
          return res.status(410).json({ error: { code: 'GONE', message } })
        }
        if (message === 'Candidate is already hired — remove the employee record instead') {
          return res.status(409).json({ error: { code: 'CONFLICT', message } })
        }
        logger.warn({ err }, 'onboarding deletion failed')
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
      }
    },
  )

  return router
}
