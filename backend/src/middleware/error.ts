import { type Request, type Response, type NextFunction } from 'express'

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } })
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status = (err as any)?.status ?? 500
  const code = (err as any)?.code ?? 'INTERNAL_ERROR'
  const message = status === 500 ? 'Internal server error' : (err as any)?.message ?? 'Unexpected error'

  if (status !== 404) {
    console.error(err)
  }

  res.status(status).json({ error: { code, message } })
}
