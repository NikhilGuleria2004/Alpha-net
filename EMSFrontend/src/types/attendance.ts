/**
 * Attendance domain (EMSFrontend.md §7.2).
 *
 * Mirrors the shared-database attendance shape: one row per user per day.
 * `late` is derived server-side from the shift start; the mark form only sends
 * `present | remote | on_leave | half_day`.
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
  /** ISO date (`YYYY-MM-DD`). */
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
  /** ISO date. */
  date: string
  marked: boolean
  status?: AttendanceStatus
  /** When the record was created — drives the 5-minute undo window (§7.2). */
  markedAt?: string
  streakDays: number
}
