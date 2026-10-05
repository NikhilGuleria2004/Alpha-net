import type {
  Timesheet,
  SaveTimesheetInput,
  DailyTimesheet,
  SaveDailyTimesheetInput,
  UpdateDailyTimesheetInput,
} from '../types/timesheet'
import apiClient, { downloadBlob } from './apiClient'
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

// ---------------------------------------------------------------------------
// ts.md Phase 6.2 — daily timesheet client. Mounted at /api/v1/timesheets/daily
// (routes/daily-timesheets.ts). Every call is scoped server-side to the
// authenticated user, so no userId is sent: a caller can never write time in
// someone else's name.
// ---------------------------------------------------------------------------

/** GET /timesheets/daily?date= — the caller's entries for one calendar date. */
export async function getDailyEntries(date: string): Promise<DailyTimesheet[]> {
  const response = await apiClient.get<{ dailyTimesheets: DailyTimesheet[] }>(`/timesheets/daily?date=${date}`)
  return response.dailyTimesheets
}

/**
 * GET /timesheets/daily?weekStart= — the caller's entries for the week starting
 * `weekStart` (a Monday), optionally narrowed to one project. Locked rows come
 * back as `status: 'locked'`, which is how the UI knows a day cannot be edited.
 */
export async function getDailyEntriesForWeek(weekStart: string, projectId?: string): Promise<DailyTimesheet[]> {
  const params = new URLSearchParams({ weekStart })
  if (projectId) params.set('projectId', projectId)
  const response = await apiClient.get<{ dailyTimesheets: DailyTimesheet[] }>(`/timesheets/daily?${params.toString()}`)
  return response.dailyTimesheets
}

/**
 * POST /timesheets/daily — logs (or re-logs) one day's hours. The backend
 * upserts on (userId, projectId, date, entryType), so posting the same
 * combination again corrects the existing entry instead of failing, and also
 * re-runs the weekly auto-compile so the parent totals stay current.
 *
 * Throws an Error shaped "[CONFLICT] …" when the day's week was submitted or
 * approved (ts.md Phase 5) — apiClient turns the 409 body into that message.
 */
export async function saveDailyEntry(input: SaveDailyTimesheetInput): Promise<DailyTimesheet> {
  const response = await apiClient.post<{ dailyTimesheet: DailyTimesheet }>('/timesheets/daily', input)
  return response.dailyTimesheet
}

/** PATCH /timesheets/daily/:id — correct the hours/type/description of an entry. */
export async function updateDailyEntry(id: string, updates: UpdateDailyTimesheetInput): Promise<DailyTimesheet> {
  const response = await apiClient.patch<{ dailyTimesheet: DailyTimesheet }>(`/timesheets/daily/${id}`, updates)
  return response.dailyTimesheet
}

/** DELETE /timesheets/daily/:id — 204 on success (no body to parse). */
export async function deleteDailyEntry(id: string): Promise<void> {
  await apiClient.delete<void>(`/timesheets/daily/${id}`)
}

/**
 * POST /timesheets/daily/compile — the manual end-of-week freeze (ts.md 4.1).
 * Aggregates the caller's daily entries for `projectId` + `weekStart` into the
 * parent weekly timesheet and locks the child days.
 */
export async function compileWeeklyTimesheet(projectId: string, weekStart: string): Promise<Timesheet> {
  const response = await apiClient.post<{ timesheet: Timesheet }>('/timesheets/daily/compile', { projectId, weekStart })
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

export interface DownloadTimesheetsPdfFilters {
  userId?: string
  projectId?: string
  status?: string
  weekStart?: string
  search?: string
}

/**
 * Downloads the aggregated timesheet PDF report for all employees (or filtered).
 * Returns the PDF Blob and filename from Content-Disposition header.
 */
export async function downloadTimesheetsPdf(
  filters?: DownloadTimesheetsPdfFilters
): Promise<{ blob: Blob; filename: string | null }> {
  const params = new URLSearchParams()
  if (filters?.userId) params.set('userId', filters.userId)
  if (filters?.projectId) params.set('projectId', filters.projectId)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.weekStart) params.set('weekStart', filters.weekStart)
  if (filters?.search) params.set('search', filters.search)

  const query = params.toString() ? `?${params.toString()}` : ''
  return downloadBlob(`/timesheets/export/pdf${query}`)
}
