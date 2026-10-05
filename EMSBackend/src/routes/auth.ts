import { Router, type Request, type Response } from 'express'
import { loginUser, refreshUserSession, logoutUser, getMe, requestPasswordReset, resetPasswordWithToken, redeemInvite } from '../services/auth.service.js'
import { authenticate, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireTrustedCookieSource } from '../middleware/csrf.js'
import { validateBody } from '../middleware/validate.js'
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, redeemInviteSchema } from '../schemas/auth.schema.js'
import { logger } from '../lib/logger.js'

const REFRESH_COOKIE_NAME = 'refreshToken'
const REFRESH_COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Cookie topology for the refresh token.
 *
 * `lax` is correct when the SPA and this API share a *site* (same eTLD+1) —
 * both under `*.vercel.app`, or `app.acme.com` + `api.acme.com`. A cross-site
 * split (SPA on one registrable domain, API on another) makes the browser
 * withhold this cookie from `fetch` entirely, so refresh fails and every user
 * is logged out on the next navigation. That deployment must set
 * COOKIE_SAME_SITE=none, which browsers only honour alongside `secure`.
 */
function cookieSameSite(): 'lax' | 'strict' | 'none' {
  const configured = (process.env.COOKIE_SAME_SITE || '').trim().toLowerCase()
  if (configured === 'none' || configured === 'strict') return configured
  return 'lax'
}

/**
 * Attributes shared by setting and clearing the cookie. Clearing a cookie whose
 * attributes differ from the ones it was set with is a silent no-op, so both
 * paths read from here rather than restating them.
 */
function baseCookieAttrs() {
  const sameSite = cookieSameSite()
  return {
    httpOnly: true,
    // Browsers reject SameSite=None unless the cookie is also Secure, so these
    // two must move together rather than tracking NODE_ENV independently.
    secure: sameSite === 'none' || process.env.NODE_ENV === 'production',
    sameSite,
    path: '/',
  }
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, baseCookieAttrs())
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseCookieAttrs(),
    maxAge: REFRESH_COOKIE_TTL_MS,
  })
}

export function authRoutes() {
  const router = Router()

  // POST /auth/login — public (dual-axis rate-limited in app.ts)
  router.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email: string; password: string }
      const result = await loginUser(email, password, req.get('user-agent'), req.ip)

      clearRefreshCookie(res)
      setRefreshCookie(res, result.refreshToken)

      logger.info({ userId: result.user.id }, 'user logged in')
      res.json({ user: result.user, accessToken: result.accessToken })
    } catch (err) {
      logger.warn({ err }, 'login failed')
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: (err as Error).message || 'Invalid email or password' } })
    }
  })

  // GET /auth/me — authenticated
  router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = await getMe(req.user!.userId)
      res.json({ user })
    } catch (err) {
      logger.warn({ err }, 'get me failed')
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: (err as Error).message || 'Not authenticated' } })
    }
  })

  // POST /auth/refresh — cookie-based; CSRF-guarded via Origin check
  router.post('/refresh', requireTrustedCookieSource, async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token provided' } })
    }
    try {
      const { accessToken, refreshToken: newRefreshToken } = await refreshUserSession(
        refreshToken, req.get('user-agent'), req.ip,
      )

      // Rotation: clear old cookie then set the new one.
      clearRefreshCookie(res)
      setRefreshCookie(res, newRefreshToken)
      res.json({ accessToken })
    } catch (err) {
      logger.warn({ err, presentedSuffix: typeof refreshToken === 'string' ? refreshToken.slice(-8) : undefined }, 'refresh failed')
      clearRefreshCookie(res)
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: (err as Error).message || 'Invalid or expired refresh token' } })
    }
  })

  // POST /auth/logout — auth-optional; always succeeds, clears cookie
  router.post('/logout', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
    const refreshToken = req.cookies?.refreshToken
    try {
      await logoutUser(refreshToken)
    } catch (err) {
      logger.warn({ err }, 'logout session cleanup failed')
    }
    clearRefreshCookie(res)
    res.status(204).send()
  })

  // POST /auth/forgot-password — public; always 200 (no enumeration)
  router.post('/forgot-password', validateBody(forgotPasswordSchema), async (req: Request, res: Response) => {
    try {
      const { email } = req.body as { email: string }
      await requestPasswordReset(email)
      res.json({ ok: true, message: 'If that account exists, a reset link is on its way.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid request'
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
    }
  })

  // POST /auth/reset-password — public
  router.post('/reset-password', validateBody(resetPasswordSchema), async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body as { token: string; password: string }
      await resetPasswordWithToken(token, password)
      res.json({ ok: true, message: 'Password has been reset. You can now sign in.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Password reset failed'
      if (message === 'Invalid or expired reset token') {
        return res.status(400).json({ error: { code: 'INVALID_TOKEN', message } })
      }
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
    }
  })

  // POST /auth/redeem-invite — public (dual-axis rate-limited)
  router.post('/redeem-invite', validateBody(redeemInviteSchema), async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body as { token: string; password: string }
      const result = await redeemInvite(token, password, req.get('user-agent'), req.ip)

      clearRefreshCookie(res)
      setRefreshCookie(res, result.refreshToken)
      res.json({ user: result.user, accessToken: result.accessToken })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invite redemption failed'
      if (message === 'Invalid or expired invite token') {
        return res.status(400).json({ error: { code: 'INVITE_INVALID', message } })
      }
      if (message === 'Set a pay rate before marking this resource billable') {
        return res.status(400).json({ error: { code: 'BILLABLE_WITHOUT_RATE', message } })
      }
      logger.warn({ err }, 'redeem invite failed')
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
    }
  })

  return router
}
