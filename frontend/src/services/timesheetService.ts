import type { Timesheet, SaveTimesheetInput } from '../types/timesheet'
import apiClient from './apiClient'
import { toLocalDateString } from '../utils/date'

export async function getTimesheets(): Promise<Timesheet[]> {
  const response = await apiClient.get<{ timesheets: Timesheet[] }>('/timesheets')
  return response.timesheets
}

export async function getTimesheetById(id: string): Promise<Timesheet | undefined> {
  const response = await apiClient.get<{ timesheet: Timesheet }>(`/timesheets/${id}`)
  return response.timesheet
}

export async function getTimesheetsByProjectId(projectId: string): Promise<Timesheet[]> {
  const response = await apiClient.get<{ timesheets: Timesheet[] }>(`/timesheets?projectId=${projectId}`)
  return response.timesheets
}

export async function saveDraft(id: string, data: SaveTimesheetInput): Promise<Timesheet | undefined> {
  const response = await apiClient.patch<{ timesheet: Timesheet }>(`/timesheets/${id}`, data)
  return response.timesheet
}

export async function submitTimesheet(id: string): Promise<Timesheet | undefined> {
  const response = await apiClient.post<{ timesheet: Timesheet }>(`/timesheets/${id}/submit`)
  return response.timesheet
}

export async function withdrawTimesheet(id: string, reason?: string): Promise<Timesheet | undefined> {
  const response = await apiClient.post<{ timesheet: Timesheet }>(`/timesheets/${id}/withdraw`, { reason })
  return response.timesheet
}

export async function approveTimesheet(id: string): Promise<Timesheet | undefined> {
  const response = await apiClient.post<{ timesheet: Timesheet }>(`/approvals/${id}/approve`)
  return response.timesheet
}

export async function declineTimesheet(id: string, reason: string): Promise<Timesheet | undefined> {
  const response = await apiClient.post<{ timesheet: Timesheet }>(`/approvals/${id}/decline`, { reason })
  return response.timesheet
}

export async function getCurrentWeekTimesheet(userId: string, projectId: string): Promise<Timesheet | undefined> {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(today.setDate(diff))
  const weekStart = toLocalDateString(monday)
  const response = await apiClient.get<{ timesheets: Timesheet[] }>(`/timesheets?userId=${userId}&projectId=${projectId}&weekStart=${weekStart}`)
  return response.timesheets[0]
}

export async function createTimesheet(data: SaveTimesheetInput): Promise<Timesheet> {
  const response = await apiClient.post<{ timesheet: Timesheet }>('/timesheets', data)
  return response.timesheet
}

export async function searchTimesheets(query: string, opts?: { projectName?: (id: string) => string | undefined; userName?: (id: string) => string | undefined }): Promise<Timesheet[]> {
  const all = await getTimesheets()
  const lower = query.toLowerCase()
  // Match on human-meaningful text (notes + resolved project/user names), not
  // raw Mongo ids. Name resolvers are injected by callers that hold the lookup
  // tables; without them we fall back to notes + ids only.
  return all.filter((t) => {
    const noteMatch = t.notes.toLowerCase().includes(lower)
    const projectName = opts?.projectName?.(t.projectId)?.toLowerCase() ?? ''
    const userName = opts?.userName?.(t.userId)?.toLowerCase() ?? ''
    return noteMatch || (projectName !== '' && projectName.includes(lower)) || (userName !== '' && userName.includes(lower))
  })
}
