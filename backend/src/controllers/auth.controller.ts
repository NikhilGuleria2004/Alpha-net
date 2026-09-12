import { type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { loginUser, logoutUser, getMe, refreshUserSession } from '../services/auth.service.js'
import { registerUser, RegistrationConflictError } from '../services/user.service.js'
import { authenticate } from '../middleware/auth.js'
import { type AuthenticatedRequest } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'
import { loginSchema, registrationSchema } from '../schemas/auth.schema.js'

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

    // The frontend apps and this API are cross-origin, so the refresh cookie
    // must be SameSite=None for the browser to attach it to cross-site
    // fetches. Browsers require `Secure` alongside SameSite=None; that
    // combination is production-only, because a Secure cookie would be dropped
    // over plain http in local dev (dev keeps Lax for the vite same-origin
    // proxy). Endpoints trusting this cookie are guarded by
    // middleware/csrf.js against untrusted origins.
    const isProd = process.env.NODE_ENV === 'production'
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    })

    logger.info({ userId: result.user.id }, 'user logged in')
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
  // httpOnly refreshToken cookie scoped to path /api/v1/auth (C6).
  try {
    const refreshToken = req.cookies?.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token provided' } })
    }

    const { accessToken } = await refreshUserSession(refreshToken)
    res.json({ accessToken })
  } catch (err) {
    logger.warn({ err }, 'refresh failed')
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: (err as Error).message || 'Invalid or expired refresh token' } })
  }
}

export async function logout(req: AuthenticatedRequest, res: Response) {
  try {
    const refreshToken = req.cookies?.refreshToken
    await logoutUser(refreshToken)
    res.clearCookie('refreshToken', { path: '/' })
    res.status(204).send()
  } catch (err) {
    logger.warn({ err }, 'logout failed')
    res.status(204).send()
  }
}

export async function forgotPassword(_req: Request, res: Response) {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Password reset not implemented yet' } })
}

export async function resetPassword(_req: Request, res: Response) {
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Password reset not implemented yet' } })
}
