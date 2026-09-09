import type { User } from '../types/auth'
import apiClient from './apiClient'

const STORAGE_KEY = 'eniac_access_token'

export async function login(email: string, password: string): Promise<User> {
  const response = await apiClient.post<{ user: User; accessToken: string }>('/auth/login', {
    email,
    password,
  })
  localStorage.setItem(STORAGE_KEY, response.accessToken)
  return response.user
}

export async function loginAsDemo(demoId: 'admin-demo' | 'user-demo' | 'supervisor-demo'): Promise<User> {
  const demoMap: Record<string, { email: string; password: string }> = {
    'admin-demo': { email: 'nikhil@eniac.demo', password: 'Password123!' },
    'user-demo': { email: 'alex@eniac.demo', password: 'Password123!' },
    'supervisor-demo': { email: 'raj@eniac.demo', password: 'Password123!' },
  }
  const credentials = demoMap[demoId]
  const response = await apiClient.post<{ user: User; accessToken: string }>('/auth/login', credentials)
  localStorage.setItem(STORAGE_KEY, response.accessToken)
  return response.user
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post<void>('/auth/logout')
  } finally {
    localStorage.removeItem(STORAGE_KEY)
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
