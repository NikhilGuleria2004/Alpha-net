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
