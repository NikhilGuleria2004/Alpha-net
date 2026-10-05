/**
 * Finance service — payroll + reports (EMSFrontend.md §7.8–7.9, Phase 7).
 * Typed wrappers over `api`.
 */
import { api } from './apiClient'
import type { PayrollRow, PayRateChange } from '../types/payroll'
import type { ReportFilters, HoursByProject, HoursByEmployee, OvertimeStats, TimesheetStatusBreakdown } from '../types/report'

export interface GetPayrollResponse {
  rows: PayrollRow[]
  rateChanges: PayRateChange[]
  totalGross: number
  period: string
}

export async function getPayroll(period?: string): Promise<GetPayrollResponse> {
  const params = period ? `?period=${period}` : ''
  return api.get<GetPayrollResponse>(`/payroll${params}`)
}

export interface GetReportResponse {
  hoursByProject: HoursByProject[]
  hoursByEmployee: HoursByEmployee[]
  overtimeStats: OvertimeStats
  statusBreakdown: TimesheetStatusBreakdown
}

export async function getReport(filters: ReportFilters): Promise<GetReportResponse> {
  return api.post<GetReportResponse>('/reports/query', filters)
}

export interface GetEmployeeStatsResponse {
  hoursByProject: HoursByProject[]
  overtimeStats: OvertimeStats
  statusBreakdown: TimesheetStatusBreakdown
}

export async function getEmployeeStats(): Promise<GetEmployeeStatsResponse> {
  return api.get<GetEmployeeStatsResponse>('/reports/employee-stats')
}
