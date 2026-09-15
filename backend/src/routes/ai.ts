import { Router, type Request, type Response } from 'express'
import { aiChatHandler, confirmAiActionHandler, cancelAiActionHandler } from '../controllers/ai.controller.js'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'
import { getAiChatRateLimitConfig } from '../lib/env.js'
import { getAiProviderInfo } from '../lib/aiProvider.js'

export function aiRoutes(): Router {
  const router = Router()

  router.use(authenticate)

  const config = getAiChatRateLimitConfig()
  const limiter = rateLimit({
    windowMs: config.windowMs,
    max: config.maxPerUser,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req as AuthenticatedRequest).user?.userId || req.ip || 'unknown',
  })

  router.post('/chat', limiter, aiChatHandler)
  router.post('/actions/:id/confirm', limiter, confirmAiActionHandler)
  router.post('/actions/:id/cancel', limiter, cancelAiActionHandler)

  router.get('/status', (_req, res) => {
    // Reports whichever provider is actually live, so the UI (and ops) never have
    // to guess after an AI_PROVIDER switch.
    res.json(getAiProviderInfo())
  })

  return router
}
