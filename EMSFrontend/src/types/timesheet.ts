import type { DayKey } from './project'

export type TimesheetStatus = 'draft' | 'pending' | 'approved' | 'declined' | 'withdrawn'

export type TimesheetEntryType = 'regular' | 'overtime'

export interface TimesheetEntry {
  id: string
  description: string
  entryType: TimesheetEntryType
  hours: Record<DayKey, number>
}

export interface TimesheetReview {
  reviewedBy: string
  reviewedAt: string
  reason?: string
}

export interface Timesheet {
  id: string
  userId: string
  projectId: string
  weekStart: string
  entries: TimesheetEntry[]
  notes: string
  regularHours: number
  overtimeHours: number
  totalHours: number
  status: TimesheetStatus
  submittedAt?: string
  review?: TimesheetReview
  createdAt: string
  updatedAt: string
}

export interface SaveTimesheetInput {
  userId: string
  projectId: string
  weekStart: string
  entries: TimesheetEntry[]
  notes: string
}

// ts.md Phase 4/6 — a daily timesheet is one day's work against one project.
// `status` is owned by the backend: 'draft' is writable, 'locked' is frozen
// because its parent weekly timesheet was submitted/approved (Phase 5 cascade).
export type DailyTimesheetStatus = 'draft' | 'locked'

export interface DailyTimesheet {
  id: string
  userId: string
  projectId: string
  /** Set when the entry was created from an assignment (Flow Integration Phase 3). */
  assignmentId?: string
  /** Parent weekly timesheet, linked by the compile step (ts.md 4.1). */
  weeklyTimesheetId?: string
  /** Calendar date the hours belong to (YYYY-MM-DD). */
  date: string
  dayOfWeek: DayKey
  /** 0.25 – 24; the backend caps the sum of a user's entries per date at 24. */
  hours: number
  entryType: TimesheetEntryType
  description: string
  status: DailyTimesheetStatus
  createdAt: string
  updatedAt: string
}

/** POST /timesheets/daily body — upserts on (userId, projectId, date, entryType). */
export interface SaveDailyTimesheetInput {
  projectId: string
  assignmentId?: string
  date: string
  hours: number
  entryType?: TimesheetEntryType
  description: string
}

/** PATCH /timesheets/daily/:id body — corrections to an existing entry. */
export interface UpdateDailyTimesheetInput {
  hours?: number
  entryType?: TimesheetEntryType
  description?: string
}
