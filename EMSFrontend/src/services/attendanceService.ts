/**
 * EMS attendance service (EMSFrontend.md §7.2, §9.1).
 *
 * One service per domain, all going through the `api` switch so mock↔real is a
 * single flag (§9.3). The envelope mirrors the shared-DB attendance shape:
 * one mark per user per day.
 *
 * §3.5 daily gate: `markAttendance` and `unmarkAttendance` notify subscribers
 * (the gate banner + the mark view) so a successful retraction hides the banner
 * without a polling round-trip — a lightweight invalidation signal, not a cache.
 */
import type { AttendanceRecord, AttendanceSummary, MarkAttendanceInput } from '../types/attendance'
import { api } from './apiClient'

type AttendanceChangeHandler = () => void

/** Subscribers are notified after any successful mark/unmark so the daily-gate
 * banner and the mark view re-sync from the persisted store (mock or real). */
const attendanceChangeHandlers: Set<AttendanceChangeHandler> = new Set()

export function onAttendanceChange(handler: AttendanceChangeHandler): () => void {
  attendanceChangeHandlers.add(handler)
  return () => {
    attendanceChangeHandlers.delete(handler)
  }
}

function notifyAttendanceChange(): void {
  attendanceChangeHandlers.forEach((handler) => handler())
}

/** Mark (or re-mark) attendance for a given day. Defaults to today. */
export async function markAttendance(
  input: MarkAttendanceInput & { date?: string },
): Promise<AttendanceRecord> {
  const record = await api.post<AttendanceRecord>('/attendance/mark', input)
  notifyAttendanceChange()
  return record
}

/**
 * Retract a same-day mark (the 5-minute "Undo" window, §7.2). DELETE mirrors the
 * mark keyed by user+date.
 */
export async function unmarkAttendance(date?: string): Promise<void> {
  const today = date ?? new Date().toISOString().slice(0, 10)
  await api.delete<void>(`/attendance/mine?date=${encodeURIComponent(today)}`)
  notifyAttendanceChange()
}

/** Today's summary for the signed-in user — drives the daily gate (§3.5). */
export async function getMyAttendance(date?: string): Promise<AttendanceSummary | null> {
  const today = date ?? new Date().toISOString().slice(0, 10)
  return api.get<AttendanceSummary>(`/attendance/mine?date=${encodeURIComponent(today)}`)
}

/**
 * Date range of the signed-in user's own marks — feeds the calendar heatmap
 * history. Defaults to the last 30 days.
 */
export async function getMyAttendanceRange(start?: string, end?: string): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const response = await api.get<{ records: AttendanceRecord[] }>(
    `/attendance/mine${params.toString() ? `?${params.toString()}` : ''}`,
  )
  return response.records
}

export interface TeamAttendanceKpi {
  on_site: number
  remote: number
  late: number
  on_leave: number
  not_marked: number
}

export interface TeamAttendanceResult {
  records: AttendanceRecord[]
  kpis: TeamAttendanceKpi
  /**
   * Roster metadata supplied by the team endpoint. Available to every role that
   * may see the roster (admin/hr/manager), unlike `GET /employees`.
   */
  members: TeamMember[]
}

export interface TeamMember {
  id: string
  name: string
  email: string
  employeeId: string
  department: string
  role: string
  avatarUrl: string
}

/**
 * Team oversight view (§7.2): every markable user's record for a date, plus KPI
 * counts. `scope` maps to the team/dept boundary the backend applies (Phase 8).
 */
export async function getTeamAttendance(
  date?: string,
  scope?: 'team' | 'department',
): Promise<TeamAttendanceResult> {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  if (scope) params.set('scope', scope)
  return api.get<TeamAttendanceResult>(
    `/attendance/team${params.toString() ? `?${params.toString()}` : ''}`,
  )
}

/**
 * Per-user attendance history for the oversight heatmap (last-N-days sparklines).
 * Returns a map keyed by user id, each value a list of records ending at
 * `anchorDate` (today by default).
 */
export async function getTeamHistoric(anchorDate?: string, range = 7): Promise<Record<string, AttendanceRecord[]>> {
  const date = anchorDate ?? new Date().toISOString().slice(0, 10)
  const response = await api.get<{ byUser: Record<string, AttendanceRecord[]> }>(
    `/attendance/team/historic?range=${encodeURIComponent(String(range))}&anchor=${encodeURIComponent(date)}`,
  )
  return response.byUser
}
