import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { validateBody } from '../middleware/validate.js'
import { logger } from '../lib/logger.js'
import { createOnboardingCandidate, getOnboardingPipeline } from '../services/onboarding.service.js'
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

  return router
}
