import { Router, type Request, type Response } from 'express'
import { aiChatHandler } from '../controllers/ai.controller.js'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import rateLimit from 'express-rate-limit'
import { getAiChatRateLimitConfig } from '../lib/env.js'

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
  
  router.get('/status', (_req, res) => {
    res.json({
      available: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    })
  })
  
  return router
}
