/**
 * Attendance domain types (EMSBackend §5.3, §7.2).
 * Mirrors EMSFrontend/src/types/attendance.ts field-for-field.
 */

export type AttendanceStatus =
  | 'present'
  | 'remote'
  | 'late'
  | 'half_day'
  | 'on_leave'
  | 'absent'
  | 'holiday'
  | 'weekend'

export type MarkableStatus = 'present' | 'remote' | 'on_leave' | 'half_day'

export interface AttendanceRecord {
  id: string
  userId: string
  date: string
  status: AttendanceStatus
  markedAt: string
  note?: string
  location?: string
  source: 'self' | 'hr' | 'system'
}

export interface MarkAttendanceInput {
  status: MarkableStatus
  note?: string
  location?: string
}

export interface AttendanceSummary {
  userId: string
  date: string
  marked: boolean
  status?: AttendanceStatus
  markedAt?: string
  streakDays: number
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
   * Additive roster metadata. Lets a manager render names and
   * roles without calling `GET /employees`, which is admin/hr-only. See D-20.
   */
  members: Array<{
    id: string
    name: string
    email: string
    employeeId: string
    department: string
    role: string
    avatarUrl: string
  }>
}
