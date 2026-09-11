import { useState, useEffect, useMemo } from 'react'
import { FileDown, ChevronUp, ChevronDown } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Card } from '../../components/ui/Card'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { resolveReportDateRange } from '../../utils/date'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getHoursByProject, getHoursByEmployee, getOvertimeStats, getTimesheetStatusBreakdown, exportToCSV } from '../../services/reportService'
import type { ReportFilters, HoursByProject, HoursByEmployee, OvertimeStats, TimesheetStatusBreakdown } from '../../types/report'

type SortDirection = 'asc' | 'desc'

export function Reports() {
  const { users, projects } = useAppData()
  const { addToast } = useToast()

  const [dateRange, setDateRange] = useState<ReportFilters['dateRange']>('30d')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')

  const [hoursByProject, setHoursByProject] = useState<HoursByProject[]>([])
  const [hoursByEmployee, setHoursByEmployee] = useState<HoursByEmployee[]>([])
  const [overtimeStats, setOvertimeStats] = useState<OvertimeStats | null>(null)
  const [statusBreakdown, setStatusBreakdown] = useState<TimesheetStatusBreakdown | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const filters: ReportFilters = useMemo(() => {
    // Every preset is resolved to an explicit date window and sent to the
    // backend — previously only 'custom' sent startDate/endDate, so the presets
    // silently bucketed all-time data (C8).
    const range = resolveReportDateRange(dateRange, startDate, endDate)
    return {
      dateRange,
      startDate: range.startDate,
      endDate: range.endDate,
      projectId: projectFilter || undefined,
      userId: employeeFilter || undefined,
      department: departmentFilter || undefined,
    }
  }, [dateRange, startDate, endDate, projectFilter, employeeFilter, departmentFilter])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const [projectData, employeeData, overtimeData, statusData] = await Promise.all([
        getHoursByProject(filters),
        getHoursByEmployee(filters),
        getOvertimeStats(filters),
        getTimesheetStatusBreakdown(filters),
      ])
      if (!cancelled) {
        setHoursByProject(projectData)
        setHoursByEmployee(employeeData)
        setOvertimeStats(overtimeData)
        setStatusBreakdown(statusData)
        setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [filters])

  const projectOptions = useMemo(() => projects.map((p) => ({ value: p.id, label: p.name })), [projects])
  const employeeOptions = useMemo(() => users.map((u) => ({ value: u.id, label: u.name })), [users])
  const departments = useMemo(() => Array.from(new Set(users.map((u) => u.department))), [users])

  const handleClear = () => {
    setDateRange('30d')
    setStartDate('')
    setEndDate('')
    setProjectFilter('')
    setEmployeeFilter('')
    setDepartmentFilter('')
  }

  const handleExport = () => {
    if (!hoursByProject.length && !hoursByEmployee.length) {
      addToast('info', 'No data to export')
      return
    }
    const exportData = hoursByProject.map((item) => ({
      projectName: item.projectName,
      regularHours: item.regularHours,
      overtimeHours: item.overtimeHours,
      totalHours: item.totalHours,
    }))
    exportToCSV(exportData, 'report')
    addToast('success', 'Report exported to CSV')
  }

  const [employeeSortDir, setEmployeeSortDir] = useState<SortDirection>('desc')
  const handleEmployeeSort = () => {
    setEmployeeSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  }

  const sortedEmployees = useMemo(() => {
    const data = [...hoursByEmployee]
    data.sort((a, b) => {
      const comparison = a.totalHours - b.totalHours
      return employeeSortDir === 'asc' ? comparison : -comparison
    })
    return data
  }, [hoursByEmployee, employeeSortDir])

  const statusItems = useMemo(() => {
    if (!statusBreakdown) return []
    return [
      { label: 'Approved', count: statusBreakdown.approved, color: 'bg-emerald-50 text-emerald-700' },
      { label: 'Pending', count: statusBreakdown.pending, color: 'bg-amber-50 text-amber-700' },
      { label: 'Declined', count: statusBreakdown.declined, color: 'bg-red-50 text-red-700' },
      { label: 'Withdrawn', count: statusBreakdown.withdrawn, color: 'bg-slate-100 text-slate-700' },
      { label: 'Draft', count: statusBreakdown.draft, color: 'bg-sky-50 text-sky-700' },
    ]
  }, [statusBreakdown])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">Timesheet analytics and insights.</p>
        </div>
        <Button variant="secondary" onClick={handleExport} leftIcon={<FileDown className="h-4 w-4" />} disabled={isLoading}>
          Export CSV
        </Button>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <Select value={dateRange} onChange={(e) => setDateRange(e.target.value as ReportFilters['dateRange'])} className="w-full sm:w-36" options={[{ value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }, { value: 'custom', label: 'Custom' }]} />
              {dateRange === 'custom' && (
                <>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-40" />
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-40" />
                </>
              )}
              <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-full sm:w-44" options={[{ value: '', label: 'All Projects' }, ...projectOptions]} />
              <Select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="w-full sm:w-44" options={[{ value: '', label: 'All Employees' }, ...employeeOptions]} />
              <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="w-full sm:w-40" options={[{ value: '', label: 'All Departments' }, ...departments.map((d) => ({ value: d, label: d }))]} />
              <Button variant="secondary" onClick={handleClear} className="w-full sm:w-auto">Clear</Button>
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Hours by Project</h2>
            </div>
            <div className="p-5">
              {hoursByProject.length === 0 ? (
                <EmptyState title="No data" description="There are no hours recorded for the selected filters." />
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hoursByProject} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="projectName" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => [`${Number(value).toFixed(1)}h`, 'Hours']} />
                      <Bar dataKey="totalHours" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Hours by Employee</h2>
              </div>
              <div className="p-5">
                {sortedEmployees.length === 0 ? (
                  <EmptyState title="No data" description="There are no hours recorded for the selected filters." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Regular</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Overtime</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Sort</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sortedEmployees.map((emp) => (
                          <tr key={emp.userId} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm font-medium text-slate-900">{emp.userName}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{emp.department}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">{emp.regularHours.toFixed(1)}h</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">{emp.overtimeHours.toFixed(1)}h</td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{emp.totalHours.toFixed(1)}h</td>
                            <td className="px-4 py-3 text-center">
                              <button type="button" onClick={handleEmployeeSort} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                {employeeSortDir === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Timesheet Status</h2>
              </div>
              <div className="p-5">
                {statusItems.length === 0 ? (
                  <EmptyState title="No data" description="There are no timesheets for the selected filters." />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {statusItems.map((item) => (
                      <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                        <StatusBadge status={item.label.toLowerCase() as 'approved' | 'pending' | 'declined' | 'withdrawn' | 'draft'} size="sm" />
                        <span className="text-lg font-semibold text-slate-900">{item.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {overtimeStats && (
            <Card>
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Overtime Summary</h2>
              </div>
              <div className="p-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm font-medium text-slate-500">Regular Hours</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{overtimeStats.regularHours.toFixed(1)}h</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm font-medium text-slate-500">Overtime</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{overtimeStats.overtimeHours.toFixed(1)}h</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <p className="text-sm font-medium text-slate-500">Total Hours</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{overtimeStats.totalHours.toFixed(1)}h</p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )

}
