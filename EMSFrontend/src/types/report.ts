export type DateRangePreset = '7d' | '30d' | '90d' | 'custom'

export type ReportStatusFilter = 'all' | 'approved' | 'pending' | 'declined' | 'withdrawn' | 'draft'

export interface ReportFilters {
  dateRange: DateRangePreset
  startDate?: string
  endDate?: string
  projectId?: string
  userId?: string
  department?: string
  // QA M8: hours aggregations previously counted draft/declined/withdrawn
  // timesheets as worked hours. Defaults to 'approved' so the numbers users
  // act on are correct out of the box; pass 'all' to opt out.
  status?: ReportStatusFilter
}

export interface HoursByProject {
  projectId: string
  projectName: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface HoursByEmployee {
  userId: string
  userName: string
  department: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface OvertimeStats {
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface TimesheetStatusBreakdown {
  draft: number
  pending: number
  approved: number
  declined: number
  withdrawn: number
}
