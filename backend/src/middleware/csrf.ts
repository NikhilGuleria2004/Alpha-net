import { type Request, type Response, type NextFunction } from 'express'
import { isAllowedOrigin } from '../lib/origins.js'
import { logger } from '../lib/logger.js'

// The refresh token cookie is SameSite=None because the frontend apps and this
// API live on different origins. That means ANY website can make a
// cookie-bearing request to endpoints that trust the cookie (e.g.
// POST /auth/refresh, POST /auth/logout). Browsers always attach an Origin
// header to cross-origin POSTs, so we verify it against the same
// FRONTEND_URL allowlist used by CORS before trusting the cookie.
export function requireTrustedCookieSource(req: Request, res: Response, next: NextFunction) {
  if (isAllowedOrigin(req.headers.origin)) {
    return next()
  }

  logger.warn(
    { origin: req.headers.origin || '(none)', path: req.originalUrl },
    'blocked cookie-authenticated request from untrusted origin',
  )
  return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Origin not allowed' } })
}