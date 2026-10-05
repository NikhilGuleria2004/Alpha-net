/**
 * EMS auth service (EMSFrontend.md §7.1, §9.2).
 *
 * Thin typed wrappers over `api`. The contract is identical to the sibling
 * `authService.ts` — `login` returns the user and stashes the access token
 * (in memory, via `setAccessToken`); `getCurrentUser` bootstraps the session
 * from the httpOnly refresh cookie on a hard reload — so the Phase 8 swap only
 * touches this file's adapter, not the callers.
 */
import type { EmsUser } from '../types/auth'
import { api, setAccessToken, refresh } from './apiClient'

/** POST /auth/login → `{ user, accessToken }`; the token is stored in memory. */
export async function login(email: string, password: string): Promise<EmsUser> {
  const response = await api.post<{ user: EmsUser; accessToken: string }>('/auth/login', {
    email,
    password,
  })
  setAccessToken(response.accessToken)
  return response.user
}

/**
 * Session bootstrap. On a hard reload the in-memory access token is gone, so
 * /auth/me 401s immediately — exactly as in the sibling (auth.service.ts QA
 * "getCurrentUser"). Try a refresh first; only give up if that also fails.
 */
export async function getCurrentUser(): Promise<EmsUser | null> {
  try {
    const response = await api.get<{ user: EmsUser }>('/auth/me')
    return response.user
  } catch {
    const restored = await refresh()
    if (!restored) return null
    try {
      const response = await api.get<{ user: EmsUser }>('/auth/me')
      return response.user
    } catch {
      return null
    }
  }
}

export async function logout(): Promise<void> {
  try {
    await api.post<void>('/auth/logout')
  } finally {
    setAccessToken(null)
  }
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post<void>('/auth/forgot-password', { email })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await api.post<void>('/auth/reset-password', { token, password })
}

/**
 * POST /auth/redeem-invite → `{ user, accessToken }`. A successful redemption
 * logs the user in (token stored) just like `login`, so the invite flow hands
 * straight off to the role's dashboard.
 */
export async function redeemInvite(token: string, password: string): Promise<EmsUser> {
  const response = await api.post<{ user: EmsUser; accessToken: string }>('/auth/redeem-invite', {
    token,
    password,
  })
  setAccessToken(response.accessToken)
  return response.user
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return Boolean(user)
}
