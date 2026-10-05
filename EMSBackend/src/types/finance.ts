import type { SupportedCurrencyCode } from './auth.js'

/**
 * Finance domain (EMSBackend §7.7).
 *
 * Read-oriented: calculation stays backend-side. Mirrors
 * `EMSFrontend/src/types/payroll.ts` and `EMSFrontend/src/types/report.ts`
 * field-for-field, because `AdminPayrollPage`/`AdminReportsPage` unwrap these
 * objects directly and non-negotiable rule 3 makes the frontend the contract.
 */

export type PayrollRowStatus = 'draft' | 'approved' | 'paid'

/**
 * One employee for one pay period. Note the frontend names are `hours`/`gross`,
 * NOT the spec's `grossHours`/`grossPay` — the frontend wins.
 */
export interface PayrollRow {
  id: string
  userId: string
  employeeName: string
  role: string
  billable: boolean
  /** Pay-period key, e.g. `2026-09`. */
  period: string
  hours: number
  payRate: number
  currency: SupportedCurrencyCode
  gross: number
  status: PayrollRowStatus
}

/** A pay-rate change from `payrate_history`, surfaced next to the payroll rows. */
export interface PayRateChange {
  id: string
  userId: string
  changedBy: string
  oldRate: number | null
  newRate: number
  currency: SupportedCurrencyCode
  reason?: string
  createdAt: string
}

export interface PayrollResult {
  rows: PayrollRow[]
  rateChanges: PayRateChange[]
  totalGross: number
  period: string
}

// ── reports ───────────────────────────────────────────────────────────────────

export type DateRangePreset = '7d' | '30d' | '90d' | 'custom'

export type ReportStatusFilter = 'all' | 'approved' | 'pending' | 'declined' | 'withdrawn' | 'draft'

/** Wire shape of `POST /reports/query` (matches `ReportFilters` exactly). */
export interface ReportFilters {
  dateRange: DateRangePreset
  startDate?: string
  endDate?: string
  projectId?: string
  userId?: string
  department?: string
  status?: ReportStatusFilter
}

/** A resolved, absolute window so aggregation never re-parses presets. */
export interface DateWindow {
  from: string
  to: string
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

export interface ReportResult {
  hoursByProject: HoursByProject[]
  hoursByEmployee: HoursByEmployee[]
  overtimeStats: OvertimeStats
  statusBreakdown: TimesheetStatusBreakdown
}

/** `GET /reports/employee-stats` omits the org-wide employee roll-up. */
export interface EmployeeStatsResult {
  hoursByProject: HoursByProject[]
  overtimeStats: OvertimeStats
  statusBreakdown: TimesheetStatusBreakdown
}