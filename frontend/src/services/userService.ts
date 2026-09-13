import type { User } from '../types/auth'
import type { CreateUserInput } from '../types/user'
import apiClient from './apiClient'

export async function getUsers(): Promise<User[]> {
  const response = await apiClient.get<{ users: User[] }>('/users')
  return response.users
}

export async function getUserById(id: string): Promise<User | undefined> {
  const response = await apiClient.get<{ user: User }>(`/users/${id}`)
  return response.user
}

export async function createUser(data: CreateUserInput): Promise<User> {
  const response = await apiClient.post<{ user: User }>('/users', data)
  return response.user
}

export async function updateUser(id: string, data: Partial<CreateUserInput>): Promise<User | undefined> {
  const response = await apiClient.patch<{ user: User }>(`/users/${id}`, data)
  return response.user
}

export async function deactivateUser(id: string): Promise<User | undefined> {
  const response = await apiClient.post<{ user: User }>(`/users/${id}/deactivate`)
  return response.user
}

export async function activateUser(id: string): Promise<User | undefined> {
  const response = await apiClient.post<{ user: User }>(`/users/${id}/activate`)
  return response.user
}

export async function getSupervisors(): Promise<User[]> {
  const response = await apiClient.get<{ supervisors: User[] }>('/supervisors')
  return response.supervisors
}

export async function getUsersBySupervisorId(supervisorId: string): Promise<User[]> {
  // Live endpoint: GET /supervisors/:id/users (admin or the supervisor themself).
  const response = await apiClient.get<{ users: User[] }>(`/supervisors/${supervisorId}/users`)
  return response.users
}

export async function searchUsers(query: string): Promise<User[]> {
  // No server-side free-text search exists on GET /users for non-admins (and
  // admin search is role/status only). Filter the scoped directory client-side.
  const all = await getUsers()
  const lower = query.toLowerCase()
  return all.filter((u) => u.name.toLowerCase().includes(lower))
}
