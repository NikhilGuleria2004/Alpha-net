import type { Project, CreateProjectInput } from '../types/project'
import apiClient from './apiClient'

export async function getProjects(): Promise<Project[]> {
  const response = await apiClient.get<{ projects: Project[] }>('/projects')
  return response.projects
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const response = await apiClient.get<{ project: Project }>(`/projects/${id}`)
  return response.project
}

export async function getProjectsByUserId(userId: string): Promise<Project[]> {
  // No server-side userId filter exists on GET /projects (it returns the
  // caller's visible set). Filter that scoped list client-side by membership.
  const all = await getProjects()
  return all.filter((p) => p.teamMemberIds.includes(userId) || p.supervisorId === userId || p.managerId === userId)
}

export async function getProjectsBySupervisorId(supervisorId: string): Promise<Project[]> {
  // Same: no server-side supervisorId param — filter the visible set locally.
  const all = await getProjects()
  return all.filter((p) => p.supervisorId === supervisorId)
}

export async function createProject(data: CreateProjectInput): Promise<Project> {
  const response = await apiClient.post<{ project: Project }>('/projects', data)
  return response.project
}

export async function updateProject(id: string, data: Partial<CreateProjectInput>): Promise<Project | undefined> {
  const response = await apiClient.patch<{ project: Project }>(`/projects/${id}`, data)
  return response.project
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await apiClient.delete<void>(`/projects/${id}`)
    return true
  } catch {
    return false
  }
}

export async function addTeamMember(projectId: string, userId: string): Promise<Project | undefined> {
  const response = await apiClient.post<{ project: Project }>(`/projects/${projectId}/team`, { userId })
  return response.project
}

export async function removeTeamMember(projectId: string, userId: string): Promise<Project | undefined> {
  const response = await apiClient.delete<{ project: Project }>(`/projects/${projectId}/team/${userId}`)
  return response.project
}

export async function assignSupervisor(projectId: string, userId: string): Promise<Project | undefined> {
  const response = await apiClient.patch<{ project: Project }>(`/projects/${projectId}/supervisor`, { supervisorId: userId })
  return response.project
}

export async function searchProjects(query: string): Promise<Project[]> {
  const response = await apiClient.get<{ projects: Project[] }>(`/projects?q=${encodeURIComponent(query)}`)
  return response.projects
}
