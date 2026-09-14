import type { User } from '../types/auth'
import apiClient, { setAccessToken, refresh } from './apiClient'

export interface RegisterInput {
  name: string
  email: string
  employeeId: string
  department: string
  password: string
  confirmPassword: string
  role: 'user' | 'admin'
  adminPass?: string
}

export async function register(input: RegisterInput): Promise<User> {
  const response = await apiClient.post<{ user: User }>('/auth/register', input)
  return response.user
}

export async function login(email: string, password: string): Promise<User> {
  const response = await apiClient.post<{ user: User; accessToken: string }>('/auth/login', {
    email,
    password,
  })
  setAccessToken(response.accessToken)
  return response.user
}

// QA M4: self-service password change. Requires the current password so a
// stale session can't silently change it; on success the backend revokes all
// existing sessions, so the client must sign out locally too.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post<void>('/auth/change-password', { currentPassword, newPassword })
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post<void>('/auth/logout')
  } finally {
    setAccessToken(null)
  }
}

// QA M6: "Forgot password?" used to be a <button type="button"> with no
// onClick, while the backend endpoint it would call was a 501 stub — the
// control was silently dead. Wire it to the endpoint; the frontend surfaces
// the honest "not implemented yet" message when the backend returns 501.
export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post<void>('/auth/forgot-password', { email })
}

// QA: getCurrentUser hit /auth/me directly and returned null on the first 401,
// bypassing the apiClient's refresh logic entirely. On reload the access token
// is gone (memory-only), so /auth/me 401s immediately and the app logged the
// user out without ever consulting the httpOnly refresh cookie. Try a refresh
// first; only give up if that also fails.
export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await apiClient.get<{ user: User }>('/auth/me')
    return response.user
  } catch {
    // Access token expired and no token in memory — try to restore the
    // session from the refresh cookie before giving up.
    const restored = await refresh()
    if (!restored) return null
    try {
      const response = await apiClient.get<{ user: User }>('/auth/me')
      return response.user
    } catch {
      return null
    }
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return Boolean(user)
}
