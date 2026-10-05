/**
 * Reports page (EMSFrontend.md §7.9, Phase 7).
 * Admin grid with filter bar, chart widgets, and table toggle.
 */
import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { DashboardShell } from '../../components/ems/DashboardShell'
import { EmsCard } from '../../components/ems/EmsCard'
import { FilterBar } from '../../components/ems/FilterBar'
import { KpiStrip } from '../../components/ems/KpiStrip'
import { KpiStat } from '../../components/ems/KpiStat'
import { DataTable, type Column } from '../../components/ems/DataTable'
import { LazyLineChart, LazyBarChart, LazyDonutChart } from '../../components/ems/LazyChart'
import { ViewSwitcher, type EmsViewMode } from '../../components/ems/ViewSwitcher'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { FileText } from 'lucide-react'
import { formatNumber } from '../../utils/currency'
import type { ReportFilters, HoursByProject, HoursByEmployee, OvertimeStats, TimesheetStatusBreakdown } from '../../types/report'
import { getReport } from '../../services/financeService'

const DATE_RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
]

export interface GetReportResponse {
  hoursByProject: HoursByProject[]
  hoursByEmployee: HoursByEmployee[]
  overtimeStats: OvertimeStats
  statusBreakdown: TimesheetStatusBreakdown
}

export function AdminReportsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [data, setData] = useState<GetReportResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [view, setView] = useState<EmsViewMode>('list')
  const [filters, setFilters] = useState<ReportFilters>({ dateRange: '30d' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getReport(filters)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load report'))
          addToast('error', 'Could not load report data.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, addToast])

  const handleExport = () => {
    if (!data) return
    const csv = [
      ['Project', 'Regular', 'Overtime', 'Total'],
      ...data.hoursByProject.map((p) => [p.projectName, p.regularHours, p.overtimeHours, p.totalHours]),
    ]
      .map((r) => r.map((c) => `"${c}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${filters.dateRange}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast('success', 'Report exported.')
  }

  const totalHours = useMemo(() => data?.overtimeStats.totalHours ?? 0, [data])
  const regularHours = useMemo(() => data?.overtimeStats.regularHours ?? 0, [data])
  const overtimeHours = useMemo(() => data?.overtimeStats.overtimeHours ?? 0, [data])

  const hoursByProjectColumns: Column<HoursByProject>[] = [
    { key: 'projectName', label: 'Project', sortable: true, render: (row) => <span className="font-medium text-foreground">{row.projectName}</span> },
    { key: 'regularHours', label: 'Regular', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatNumber(row.regularHours, 1)}</span> },
    { key: 'overtimeHours', label: 'Overtime', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatNumber(row.overtimeHours, 1)}</span> },
    { key: 'totalHours', label: 'Total', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatNumber(row.totalHours, 1)}</span> },
  ]

  const hoursByEmployeeColumns: Column<HoursByEmployee>[] = [
    { key: 'userName', label: 'Employee', sortable: true, render: (row) => <span className="font-medium text-foreground">{row.userName}</span> },
    { key: 'department', label: 'Department', sortable: true, render: (row) => <span className="text-sm text-muted-foreground">{row.department}</span> },
    { key: 'regularHours', label: 'Regular', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatNumber(row.regularHours, 1)}</span> },
    { key: 'overtimeHours', label: 'Overtime', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatNumber(row.overtimeHours, 1)}</span> },
    { key: 'totalHours', label: 'Total', sortable: true, align: 'right', render: (row) => <span className="ems-tabular font-semibold">{formatNumber(row.totalHours, 1)}</span> },
  ]

  return (
    <DashboardShell
      title="Reports"
      subtitle={`Hours & utilization · Signed in as ${user?.name ?? '…'}`}
      kpiCount={4}
      loading={loading}
      error={error}
      data={data}
      onRetry={() => {
        setData(null)
        setError(null)
      }}
    >
      {() => (
        <div className="space-y-4">
          <FilterBar
            searchValue={filters.userId ?? ''}
            onSearchChange={(v) => setFilters({ ...filters, userId: v || undefined })}
            searchPlaceholder="Filter by employee…"
            chips={[
              { id: 'dateRange', label: filters.dateRange, active: true, onToggle: () => {} },
              { id: 'status', label: `Status: ${filters.status ?? 'all'}`, active: !!filters.status, onToggle: () => setFilters({ ...filters, status: filters.status ? undefined : 'approved' }) },
            ]}
            actions={
              <>
                <Select
                  value={filters.dateRange}
                  onChange={(e) => setFilters({ ...filters, dateRange: e.target.value as ReportFilters['dateRange'] })}
                  options={DATE_RANGES}
                />
                {data && (
                  <Button variant="secondary" leftIcon={<FileText className="h-4 w-4" />} onClick={handleExport}>
                    Export CSV
                  </Button>
                )}
              </>
            }
          />

          <KpiStrip>
            <KpiStat label="Total Hours" value={formatNumber(totalHours, 1)} />
            <KpiStat label="Regular" value={formatNumber(regularHours, 1)} />
            <KpiStat label="Overtime" value={formatNumber(overtimeHours, 1)} />
            <KpiStat label="Projects" value={data?.hoursByProject.length ?? 0} />
          </KpiStrip>

          <div className="mb-4">
            <ViewSwitcher value={view} onChange={setView} modes={['list', 'board', 'grid']} />
          </div>

          {view === 'list' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <EmsCard title="Hours by Project" subtitle="Top projects by billable hours">
                <DataTable columns={hoursByProjectColumns} data={data?.hoursByProject ?? []} pageSize={7} />
              </EmsCard>
              <EmsCard title="Hours by Employee" subtitle="Utilization by team member">
                <DataTable columns={hoursByEmployeeColumns} data={data?.hoursByEmployee ?? []} pageSize={7} />
              </EmsCard>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <EmsCard title="Overtime Trend" subtitle="Overtime hours over time">
                <LazyLineChart
                  data={[...Array(30)].map((_, i) => ({
                    label: `${i + 1}`,
                    value: (data?.overtimeStats.overtimeHours ?? 0) / 30,
                  }))}
                  height={160}
                  ariaLabel="Overtime trend over 30 days"
                />
              </EmsCard>
              <EmsCard title="Hours Breakdown" subtitle="Regular vs overtime">
                <LazyDonutChart
                  data={[
                    { label: 'Regular', value: regularHours, color: '#10b981' },
                    { label: 'Overtime', value: overtimeHours, color: '#f59e0b' },
                  ]}
                  height={140}
                  ariaLabel="Hours breakdown"
                />
              </EmsCard>
            </div>
          )}

          <EmsCard title="Team Weekly Hours" subtitle="Hours per day, last period">
            <LazyBarChart
              data={(data?.hoursByEmployee ?? []).map((e) => ({
                label: e.userName.split(' ')[0],
                value: e.totalHours,
              }))}
              height={160}
              ariaLabel="Weekly hours by team member"
            />
          </EmsCard>
        </div>
      )}
    </DashboardShell>
  )
}
