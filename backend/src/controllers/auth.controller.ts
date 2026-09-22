import { type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { loginUser, logoutUser, getMe, refreshUserSession, changePassword, requestPasswordReset, resetPasswordWithToken, requestLoginOtp, verifyLoginOtp } from '../services/auth.service.js'
import { registerUser, RegistrationConflictError } from '../services/user.service.js'
import { authenticate } from '../middleware/auth.js'
import { type AuthenticatedRequest } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'
import { loginSchema, registrationSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema, otpRequestSchema, otpVerifySchema } from '../schemas/auth.schema.js'

function hasValidAdminPass(providedPass: string | undefined): boolean {
  const configuredPass = process.env.ADMIN_REGISTRATION_SECRET
  if (!configuredPass) {
    return false
  }

  const provided = Buffer.from(providedPass ?? '')
  const configured = Buffer.from(configuredPass)
  return provided.length === configured.length && timingSafeEqual(provided, configured)
}

export async function register(req: Request, res: Response) {
  let input: ReturnType<typeof registrationSchema.parse>
  try {
    input = registrationSchema.parse(req.body)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid registration details'
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }

  if (input.role === 'admin') {
    const configuredPass = process.env.ADMIN_REGISTRATION_SECRET
    if (!configuredPass || !hasValidAdminPass(input.adminPass)) {
      return res.status(403).json({ error: { code: 'ADMIN_REGISTRATION_DISABLED', message: 'Admin registration is not available' } })
    }
  }

  try {
    const user = await registerUser({
      name: input.name,
      email: input.email,
      employeeId: input.employeeId,
      department: input.department,
      password: input.password,
    }, input.role)
    return res.status(201).json({ user })
  } catch (err) {
    if (err instanceof RegistrationConflictError) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: err.message } })
    }
    logger.warn({ err }, 'registration failed')
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to create account' } })
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const result = await loginUser(email, password)

    const isProd = process.env.NODE_ENV === 'production'

    // QA: the httpOnly refresh cookie used to be set without first clearing any
    // existing one, so repeated logins accumulated multiple cookies with the
    // same name. When the browser sends them all on /auth/refresh,
    // cookie-parser picks one arbitrarily — often a stale token from an earlier
    // session — and the refresh fails with "Invalid or expired refresh token",
    // which reads to the user as being logged out on every reload. Clear first
    // so there is never more than one refreshToken cookie at a time.
    res.clearCookie('refreshToken', { path: '/', httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd })

    // The frontend apps and this API are cross-origin, so the refresh cookie
    // must be SameSite=None for the browser to attach it to cross-site
    // fetches. Browsers require `Secure` alongside SameSite=None; that
    // combination is production-only, because a Secure cookie would be dropped
    // over plain http in local dev (dev keeps Lax for the vite same-origin
    // proxy). Endpoints trusting this cookie are guarded by
    // middleware/csrf.js against untrusted origins.
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    })

    logger.info({ userId: result.user.id }, 'user logged in')
    // QA A11 diagnostics: correlate the issued cookie with the refresh
    // attempts that follow. Only the last 8 chars are logged — enough to
    // match a presented token to its session row without exposing the JWT.
    logger.info(
      { userId: result.user.id, refreshTokenSuffix: result.refreshToken.slice(-8) },
      'refresh token issued and set as cookie'
    )
    res.json({ user: result.user, accessToken: result.accessToken })
  } catch (err) {
    logger.warn({ err }, 'login failed')
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: (err as Error).message || 'Invalid email or password' } })
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  try {
    const user = await getMe(req)
    res.json({ user })
  } catch (err) {
    logger.warn({ err }, 'get me failed')
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: (err as Error).message || 'Not authenticated' } })
  }
}

export async function refresh(req: Request, res: Response) {
  // No `authenticate` middleware here by design — the access token has likely
  // expired (that's why the client is refreshing). The credential is the
  // httpOnly refreshToken cookie scoped to path / (see login()).
  const isProd = process.env.NODE_ENV === 'production'
  // QA A11: mirror the login Set-Cookie attributes exactly (same path and the
  // same SameSite/secure pair). Browsers replace a cookie by name+path, so the
  // clearing call must match how the cookie was set in dev (Lax) and prod
  // (None + Secure).
  const clearRefreshCookie = () =>
    res.clearCookie('refreshToken', {
      path: '/',
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    })
  try {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token provided' } })
    }

    const { accessToken } = await refreshUserSession(refreshToken)
    res.json({ accessToken })
  } catch (err) {
    // QA A11 diagnostics: log which token the browser presented (last 8
    // chars) so a mismatch between the issued cookie and the presented one
    // becomes visible in the terminal.
    const presented = req.cookies?.refreshToken
    logger.warn(
      {
        err,
        presentedTokenSuffix: typeof presented === 'string' ? presented.slice(-8) : undefined,
        cookieHeader: typeof req.headers.cookie === 'string' ? req.headers.cookie.slice(0, 120) : undefined,
      },
      'refresh failed'
    )
    // QA A11: the presented cookie references a deleted/expired session (e.g.
    // after a password change, a logout elsewhere, or a DB reset). Without
    // clearing it, the browser keeps sending the dead token forever and every
    // reload 401s until the user manually deletes the cookie in DevTools.
    // Clearing it here logs the user out exactly once and self-heals every
    // subsequent load. No cookie present → nothing to clear (and no extra
    // Set-Cookie noise on anonymous requests).
    clearRefreshCookie()
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: (err as Error).message || 'Invalid or expired refresh token' } })
  }
}

export async function logout(req: AuthenticatedRequest, res: Response) {
  try {
    const refreshToken = req.cookies?.refreshToken
    await logoutUser(refreshToken)
    // QA A11: mirror the login cookie attributes (dev Lax / prod None+Secure)
    // so the deletion matches the cookie that was actually set.
    const isProd = process.env.NODE_ENV === 'production'
    res.clearCookie('refreshToken', {
      path: '/',
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    })
    res.status(204).send()
  } catch (err) {
    logger.warn({ err }, 'logout failed')
    res.status(204).send()
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body)
    await requestPasswordReset(email)
    // Same response whether or not the account exists (no enumeration).
    res.json({ ok: true, message: 'If that account exists, a reset link is on its way.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

// "Forgot password?" on the login page: email a 6-digit OTP so the user can
// sign in without their password. The response text is the same whether or
// not the account exists, so the endpoint cannot enumerate users.
export async function requestOtp(req: Request, res: Response) {
  try {
    const { email } = otpRequestSchema.parse(req.body)
    await requestLoginOtp(email)
    res.json({ ok: true, message: 'If that account exists, a sign-in code is on its way.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request'
    if (message === 'Please wait a minute before requesting a new code') {
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message } })
    }
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function verifyOtp(req: Request, res: Response) {
  try {
    const { email, otp } = otpVerifySchema.parse(req.body)
    const result = await verifyLoginOtp(email, otp)

    const isProd = process.env.NODE_ENV === 'production'
    res.clearCookie('refreshToken', { path: '/', httpOnly: true, sameSite: isProd ? 'none' : 'lax', secure: isProd })
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    })
    res.json({ user: result.user, accessToken: result.accessToken })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed'
    if (message === 'Invalid or expired code') {
      return res.status(400).json({ error: { code: 'INVALID_OTP', message } })
    }
    if (message === 'Too many attempts. Request a new code.') {
      return res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message } })
    }
    if (message === 'User not found or inactive') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message } })
    }
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body)
    await resetPasswordWithToken(token, password)
    res.json({ ok: true, message: 'Password has been reset. You can now sign in.' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Password reset failed'
    if (message === 'Invalid or expired reset token') {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message } })
    }
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

// QA M4: self-service password change. Requires the current password so a
// stale session can't silently change it; the new password must meet the
// same strength rules as registration. On success it revokes all existing
// sessions so the user must re-authenticate on every other device.
export async function changePasswordHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
    await changePassword(req.user!.userId, currentPassword, newPassword)
    res.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to change password'
    if (message === 'User not found') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message } })
    }
    if (message === 'Current password is incorrect') {
      return res.status(400).json({ error: { code: 'INVALID_CREDENTIALS', message } })
    }
    logger.warn({ err }, 'change password failed')
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}
