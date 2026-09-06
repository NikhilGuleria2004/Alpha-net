import type { User, UserRole } from '../types/auth'
import apiClient from './apiClient'

const STORAGE_KEY = 'alphanet_access_token'

export async function login(role: UserRole): Promise<User> {
  const response = await apiClient.post<{ user: User; accessToken: string }>('/auth/login', {
    email: `${role}@alphanet.demo`,
    password: 'password',
  })
  localStorage.setItem(STORAGE_KEY, response.accessToken)
  return response.user
}

export async function loginAsDemo(demoId: 'admin-demo' | 'user-demo' | 'supervisor-demo'): Promise<User> {
  const demoMap: Record<string, string> = {
    'admin-demo': 'admin@alphanet.demo',
    'user-demo': 'user@alphanet.demo',
    'supervisor-demo': 'supervisor@alphanet.demo',
  }
  const response = await apiClient.post<{ user: User; accessToken: string }>('/auth/login', {
    email: demoMap[demoId],
    password: 'password',
  })
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
