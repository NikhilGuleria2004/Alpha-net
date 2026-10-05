import { type Request, type Response, type NextFunction } from 'express'
import { isAllowedOrigin } from '../lib/origins.js'
import { logger } from '../lib/logger.js'

// The refresh token cookie is SameSite=Lax in the EMS (§4.3). SameSite=Lax
// already prevents cross-site browsers from sending the cookie on POSTs, but
// we keep this guard as defense-in-depth for same-site-cookie scenarios and to
// log any cross-origin attempts. For SameSite=None deployments (future), this
// becomes the primary CSRF mitigation.
export function requireTrustedCookieSource(_req: Request, res: Response, next: NextFunction) {
  if (isAllowedOrigin(_req.headers.origin)) {
    return next()
  }

  logger.warn(
    { origin: _req.headers.origin || '(none)', path: _req.originalUrl },
    'blocked cookie-authenticated request from untrusted origin',
  )
  return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Origin not allowed' } })
}
