import { type Response } from 'express'
import { chatWithGemini } from '../services/ai.service.js'
import { logger } from '../lib/logger.js'
import { type AuthenticatedRequest } from '../middleware/auth.js'
import { aiChatRequestSchema } from '../schemas/ai.schema.js'

export async function aiChatHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = aiChatRequestSchema.parse(req.body)
    const result = await chatWithGemini(req, body)
    return res.json({ response: result.response })
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return res.status(400).json({ 
        error: { code: 'VALIDATION_ERROR', message: err.message } 
      })
    }
    logger.error({ err }, 'AI chat handler error')
    return res.status(503).json({ 
      error: { code: 'AI_UNAVAILABLE', message: 'AI assistant is currently unavailable' } 
    })
  }
}
