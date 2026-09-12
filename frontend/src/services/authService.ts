import type { User } from '../types/auth'
import apiClient, { setAccessToken } from './apiClient'

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

export async function loginAsDemo(demoId: 'admin-demo' | 'user-demo' | 'supervisor-demo'): Promise<User> {
  const demoMap: Record<string, { email: string; password: string }> = {
    // Emails must match the accounts seeded by backend/src/scripts/seed-demo-users.ts
    // (which uses the @eniac.demo domain) — the previous @alphanet.demo values made
    // every demo-login attempt fail (QA_REPORT.md C5).
    'admin-demo': { email: 'nikhil@eniac.demo', password: 'Password123!' },
    'user-demo': { email: 'alex@eniac.demo', password: 'Password123!' },
    'supervisor-demo': { email: 'raj@eniac.demo', password: 'Password123!' },
  }
  const credentials = demoMap[demoId]
  const response = await apiClient.post<{ user: User; accessToken: string }>('/auth/login', credentials)
  setAccessToken(response.accessToken)
  return response.user
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post<void>('/auth/logout')
  } finally {
    setAccessToken(null)
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await apiClient.get<{ user: User }>('/auth/me')
    return response.user
  } catch {
    return null
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return Boolean(user)
}
