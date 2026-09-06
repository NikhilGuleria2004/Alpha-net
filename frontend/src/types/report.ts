export type DateRangePreset = '7d' | '30d' | '90d' | 'custom'

export interface ReportFilters {
  dateRange: DateRangePreset
  startDate?: string
  endDate?: string
  projectId?: string
  userId?: string
  department?: string
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
