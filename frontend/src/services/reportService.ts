import type { ReportFilters, HoursByProject, HoursByEmployee, OvertimeStats, TimesheetStatusBreakdown } from '../types/report'
import apiClient from './apiClient'

function toQueryString(filters: ReportFilters): string {
  const params = new URLSearchParams()
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)
  if (filters.projectId) params.set('projectId', filters.projectId)
  if (filters.userId) params.set('userId', filters.userId)
  if (filters.department) params.set('department', filters.department)
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  return params.toString()
}

export async function getHoursByProject(filters: ReportFilters): Promise<HoursByProject[]> {
  const qs = toQueryString(filters)
  const endpoint = `/reports/hours-by-project${qs ? `?${qs}` : ''}`
  const response = await apiClient.get<{ data: HoursByProject[] }>(endpoint)
  return response.data
}

export async function getHoursByEmployee(filters: ReportFilters): Promise<HoursByEmployee[]> {
  const qs = toQueryString(filters)
  const endpoint = `/reports/hours-by-employee${qs ? `?${qs}` : ''}`
  const response = await apiClient.get<{ data: HoursByEmployee[] }>(endpoint)
  return response.data
}

export async function getOvertimeStats(filters: ReportFilters): Promise<OvertimeStats> {
  const qs = toQueryString(filters)
  const endpoint = `/reports/overtime${qs ? `?${qs}` : ''}`
  const response = await apiClient.get<{ data: OvertimeStats }>(endpoint)
  return response.data
}

export async function getTimesheetStatusBreakdown(filters: ReportFilters): Promise<TimesheetStatusBreakdown> {
  const qs = toQueryString(filters)
  const endpoint = `/reports/timesheet-status${qs ? `?${qs}` : ''}`
  const response = await apiClient.get<{ data: TimesheetStatusBreakdown }>(endpoint)
  return response.data
}

function escapeCSVValue(value: string): string {
  const escaped = value.replace(/"/g, '""')
  const needsQuoting = /[",\r\n]/.test(value)
  const isFormulaInjection = /^[=+\-@]/.test(value)
  if (needsQuoting || isFormulaInjection) {
    return `"${escaped}"`
  }
  return escaped
}


export async function exportToCSV(data: unknown[], filename: string): Promise<void> {
  if (!data.length) return
  const headers = Object.keys(data[0] as Record<string, unknown>)
  const csv = [
    headers.join(','),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = (row as Record<string, unknown>)[header]
          return escapeCSVValue(String(value ?? ''))
        })
        .join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
