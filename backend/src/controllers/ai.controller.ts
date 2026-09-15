import { type Response, type Request } from 'express'
import { chatWithAssistant, confirmPendingAction, cancelPendingAction } from '../services/ai.service.js'
import { logger } from '../lib/logger.js'
import { type AuthenticatedRequest } from '../middleware/auth.js'
import { aiChatRequestSchema } from '../schemas/ai.schema.js'

/**
 * Providers return 429 for both per-minute and per-day quota exhaustion. Surfacing
 * that distinctly (instead of the generic "unavailable") tells the user whether
 * they should wait a moment or come back tomorrow / raise their plan limit.
 * `AiProviderError` carries `status`; the regex covers SDK paths that omit it.
 */
function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: unknown }).status
  if (status === 429 || status === '429') return true
  const message = err instanceof Error ? err.message : ''
  return /exceeded your current quota|quota exceeded|rate limit/i.test(message)
}

function extractUserToken(req: Request): string | undefined {
  const header = req.headers.authorization
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim()
    return token || undefined
  }
  return undefined
}

export async function aiChatHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const userToken = extractUserToken(req)
    if (!userToken) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' },
      })
    }
    const body = aiChatRequestSchema.parse(req.body)
    const result = await chatWithAssistant(req, body, userToken)
    return res.json({ response: result.response, pendingAction: result.pendingAction ?? null })
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.message }
      })
    }
    if (isQuotaError(err)) {
      logger.warn({ err }, 'AI chat quota exceeded')
      return res.status(429).json({
        error: {
          code: 'AI_QUOTA_EXCEEDED',
          message:
            'The AI assistant has hit its usage limit for now. Please try again later.',
        },
      })
    }
    logger.error({ err }, 'AI chat handler error')
    return res.status(503).json({
      error: { code: 'AI_UNAVAILABLE', message: 'AI assistant is currently unavailable' }
    })
  }
}

export async function confirmAiActionHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const userToken = extractUserToken(req)
    if (!userToken) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' },
      })
    }
    const id = String(req.params.id || '')
    if (!id) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Action ID is required' },
      })
    }
    const result = await confirmPendingAction(req, id, userToken)
    return res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to confirm action'
    if (message.startsWith('NOT_FOUND') || message.startsWith('EXPIRED')) {
      return res.status(410).json({ error: { code: 'ACTION_EXPIRED', message: 'This action has expired or no longer exists' } })
    }
    if (message.startsWith('FORBIDDEN')) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not own this action' } })
    }
    if (message.startsWith('VALIDATION')) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
    }
    logger.error({ err }, 'AI confirm action error')
    return res.status(502).json({ error: { code: 'ACTION_FAILED', message } })
  }
}

export async function cancelAiActionHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const id = String(req.params.id || '')
    if (!id) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Action ID is required' },
      })
    }
    const result = cancelPendingAction(req, id)
    return res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel action'
    if (message.startsWith('NOT_FOUND')) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Action not found' } })
    }
    if (message.startsWith('FORBIDDEN')) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not own this action' } })
    }
    logger.error({ err }, 'AI cancel action error')
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } })
  }
}
