import { type Request, type Response, type NextFunction } from 'express'
import type { z } from 'zod'

function sendValidationError(res: Response, issues: z.ZodIssue[]) {
  const details = issues.reduce((acc, issue) => {
    const path = issue.path.join('.')
    acc[path] = issue.message
    return acc
  }, {} as Record<string, string>)

  res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details,
    },
  })
}

export function validateBody(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return sendValidationError(res, result.error.issues)
    }
    req.body = result.data
    next()
  }
}

export function validateQuery(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      return sendValidationError(res, result.error.issues)
    }
    req.query = result.data as any
    next()
  }
}
