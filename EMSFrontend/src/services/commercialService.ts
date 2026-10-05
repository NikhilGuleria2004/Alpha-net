/**
 * Commercial service — clients, projects, assignments (EMSFrontend.md §7.6–7.7, Phase 6).
 * Typed wrappers over `api`. Swapped to real API in Phase 8.
 */
import { api } from './apiClient'
import type { Client, CreateClientInput } from '../types/client'
import type { Project, ProjectStatus } from '../types/project'
import type { Assignment } from '../types/assignment'
import type { SupportedCurrencyCode } from '../types/auth'

export interface GetClientsResponse {
  clients: Client[]
  total: number
}

export interface GetProjectsResponse {
  projects: Project[]
  total: number
}

export interface GetAssignmentsResponse {
  assignments: Assignment[]
  total: number
}

export interface GetProjectDetailResponse {
  project: Project
  assignments: Assignment[]
  team: Array<{ userId: string; name: string; role: string }>
  documents: Array<{ id: string; name: string; kind: string; uploadedAt: string }>
}

export interface GetClientDetailResponse {
  client: Client
  projects: Project[]
  contacts: Array<{ name: string; email: string; phone: string }>
  activity: Array<{ id: string; description: string; actor: string; timestamp: string; kind: string }>
}

export async function getClients(): Promise<GetClientsResponse> {
  return api.get<GetClientsResponse>('/clients')
}

export async function getClient(id: string): Promise<GetClientDetailResponse> {
  return api.get<GetClientDetailResponse>(`/clients/${id}`)
}

export async function createClient(input: CreateClientInput): Promise<{ client: Client }> {
  return api.post<{ client: Client }>('/clients', input)
}

export async function getProjects(): Promise<GetProjectsResponse> {
  return api.get<GetProjectsResponse>('/projects')
}

export async function getProject(id: string): Promise<GetProjectDetailResponse> {
  return api.get<GetProjectDetailResponse>(`/projects/${id}`)
}

export async function createProject(input: {
  name: string
  clientId: string
  sowNumber: string
  poCap?: number
  startDate: string
  endDate: string
  deadline?: string
  description?: string
  skillsRequired?: string[]
  billRateDefault?: number
  status?: ProjectStatus
}): Promise<{ project: Project }> {
  return api.post<{ project: Project }>('/projects', input)
}

export async function getAssignments(): Promise<GetAssignmentsResponse> {
  return api.get<GetAssignmentsResponse>('/assignments')
}

export async function createAssignment(input: {
  userId: string
  projectId: string
  billRate: number
  payRate?: number
  currency?: SupportedCurrencyCode
  ftePercent?: number
  roleOnProject?: string
  startDate: string
  endDate: string
}): Promise<{ assignment: Assignment }> {
  return api.post<{ assignment: Assignment }>('/assignments', input)
}

export async function unassignResource(assignmentId: string): Promise<void> {
  return api.delete<void>(`/assignments/${assignmentId}`)
}

export async function getAssignmentDemand(): Promise<{ demands: Array<{ id: string; projectName: string; role: string; skills: string[]; seats: number; filled: number; startDate: string; endDate: string }> }> {
  return api.get<{ demands: any[] }>('/assignments/demand')
}
