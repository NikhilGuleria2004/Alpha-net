/**
 * HR service — typed wrappers over `api` (EMSFrontend.md §9.2, §7.4–7.5).
 * Phase 5: employees, onboarding, leave, documents. Swapped to real API in Phase 8
 * by flipping VITE_USE_MOCK.
 */
import { api } from './apiClient'
import type { EmsUser, SupportedCurrencyCode } from '../types/auth'
import type { CreateUserInput, UpdateUserInput } from '../types/user'
import type { OnboardingCandidate, OnboardingPipeline, LeaveRequest, LeaveType, PayRateHistoryEntry } from '../types/hr'
import type { EmsDocument, DocumentKind } from '../types/document'

export interface GetEmployeesResponse {
  users: EmsUser[]
  total: number
}

export interface GetEmployeeDetailResponse {
  user: EmsUser
  payrateHistory: PayRateHistoryEntry[]
  documents: EmsDocument[]
}

export interface GetOnboardingPipelineResponse {
  pipeline: OnboardingPipeline
  candidates: OnboardingCandidate[]
}

export interface GetDepartmentsResponse {
  departments: string[]
}

export interface GetLeaveRequestsResponse {
  requests: LeaveRequest[]
  total: number
}

export interface GetLeaveTypesResponse {
  types: { value: LeaveType; label: string }[]
}

export interface GetDocumentsResponse {
  documents: EmsDocument[]
  total: number
}

export interface CreateOnboardingInput {
  name: string
  email: string
  employeeId: string
  department: string
  role: EmsUser['role']
  billable?: boolean
  payRate?: number
  currency?: SupportedCurrencyCode
}

export interface CreateLeaveInput {
  type: string
  startDate: string
  endDate: string
  reason?: string
  note?: string
}

export async function getEmployees(query?: string): Promise<GetEmployeesResponse> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : ''
  return api.get<GetEmployeesResponse>(`/employees${qs}`)
}

export async function getEmployeeDetail(id: string): Promise<GetEmployeeDetailResponse> {
  return api.get<GetEmployeeDetailResponse>(`/employees/${id}`)
}

export async function createEmployee(input: CreateUserInput): Promise<{ user: EmsUser; accessToken: string }> {
  return api.post<{ user: EmsUser; accessToken: string }>('/employees', input)
}

export async function updateEmployee(id: string, input: UpdateUserInput): Promise<{ user: EmsUser }> {
  return api.patch<{ user: EmsUser }>(`/employees/${id}`, input)
}

export async function getOnboardingPipeline(): Promise<GetOnboardingPipelineResponse> {
  return api.get<GetOnboardingPipelineResponse>('/onboarding/pipeline')
}

export async function createOnboarding(input: CreateOnboardingInput): Promise<{ candidate: OnboardingCandidate }> {
  return api.post<{ candidate: OnboardingCandidate }>('/onboarding', input)
}

export async function getDepartments(): Promise<GetDepartmentsResponse> {
  return api.get<GetDepartmentsResponse>('/departments')
}

export async function getLeaveRequests(type?: string): Promise<GetLeaveRequestsResponse> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : ''
  return api.get<GetLeaveRequestsResponse>(`/leave${qs}`)
}

export async function getLeaveTypes(): Promise<GetLeaveTypesResponse> {
  return api.get<GetLeaveTypesResponse>('/leave/types')
}

export async function createLeaveRequest(input: CreateLeaveInput): Promise<{ request: LeaveRequest }> {
  return api.post<{ request: LeaveRequest }>('/leave', input)
}

export async function updateLeaveStatus(id: string, status: LeaveRequest['status']): Promise<{ request: LeaveRequest }> {
  return api.patch<{ request: LeaveRequest }>(`/leave/${id}`, { status })
}

export async function getDocuments(type?: DocumentKind): Promise<GetDocumentsResponse> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : ''
  return api.get<GetDocumentsResponse>(`/documents${qs}`)
}

export async function getPayrateHistory(): Promise<PayRateHistoryEntry[]> {
  return api.get<PayRateHistoryEntry[]>('/payrate/history')
}
