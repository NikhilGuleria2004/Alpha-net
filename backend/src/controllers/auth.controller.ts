import { type Request, type Response } from 'express'
import { loginUser, logoutUser, getMe, refreshUserSession } from '../services/auth.service.js'
import { authenticate } from '../middleware/auth.js'
import { type AuthenticatedRequest } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'
import { loginSchema } from '../schemas/auth.schema.js'

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const result = await loginUser(email, password)

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
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
    res.clearCookie('refreshToken', { path: '/api/v1/auth' })
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
