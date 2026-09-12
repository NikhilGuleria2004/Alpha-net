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
