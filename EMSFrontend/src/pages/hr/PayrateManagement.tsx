/**
 * Pay Rates page (EMSFrontend.md §7.8, Phase 5 5.6).
 * Payroll tables + rate-change history timeline + export.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable } from '../../components/ems/DataTable'
import { FilterBar } from '../../components/ems/FilterBar'
import { EmsCard } from '../../components/ems/EmsCard'
import { TimelineRail } from '../../components/ems/TimelineRail'
import { StatusRail } from '../../components/ems/StatusRail'
import type { Column } from '../../components/ems/DataTable'
import type { TimelineItem } from '../../components/ems/TimelineRail'
import { useEmployeeBase } from '../../hooks/useEmployeeBase'
import { getEmployees, getPayrateHistory } from '../../services/hrService'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import type { EmsUser } from '../../types/auth'
import type { PayRateHistoryEntry } from '../../types/hr'
import { formatMoney } from '../../utils/currency'

/** Module-scope so no `new Date()` runs during render (react/purity). */
const NOW_MS = new Date().getTime()

interface DepartmentStats {
  department: string
  headcount: number
  billable: number
  avgRate: number
}

export function HrPayrateManagement() {
  const employeeBase = useEmployeeBase()
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('All')

  const { addToast } = useToast()
  const [allUsers, setAllUsers] = useState<EmsUser[]>([])
  const [rateHistory, setRateHistory] = useState<PayRateHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const showLoading = useDelayedLoading(loading)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getEmployees(), getPayrateHistory()])
      .then(([directory, history]) => {
        if (cancelled) return
        setAllUsers(directory.users)
        setRateHistory(history)
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load pay rates.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const users = allUsers.filter((u) => {
    const q = search.toLowerCase()
    if (q && !(u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.employeeId.toLowerCase().includes(q))) return false
    if (deptFilter !== 'All' && u.department !== deptFilter) return false
    return true
  })

  const departments = useMemo(
    () => ['All', ...Array.from(new Set(allUsers.map((u) => u.department).filter((d): d is string => !!d))).sort()],
    [allUsers],
  )

  const departmentStats = useMemo(() => buildDepartmentStats(allUsers), [allUsers])

  const rateEntries: TimelineItem[] = rateHistory.map((p) => {
    const rateChange = p.oldRate === null ? `${formatMoney(p.newRate, p.currency)}/hr` : `${formatMoney(p.oldRate, p.currency)}/hr → ${formatMoney(p.newRate, p.currency)}/hr`
    return {
      id: p.id,
      title: `${p.employeeName}: ${rateChange}`,
      description: `${p.reason ?? 'Rate change'} by ${p.changedBy}`,
      timestamp: p.createdAt,
      tone: p.oldRate === null ? 'success' : 'info',
    }
  })

  const recentChanges = rateHistory.filter((p) => isWithin30Days(p.createdAt)).length

  if (showLoading) {
    return (
      <div className="p-4">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg border border-border" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pay Rates</h1>
          <p className="mt-1 text-sm text-muted-foreground">Rate-change history and current pay across the org.</p>
        </div>
        <button
          onClick={() => {
            const csv = ['Name,Employee ID,Pay Rate,Currency,Billable', ...users.map((u) => `${u.name},${u.employeeId},${u.payRate ?? ''},${u.currency ?? ''},${u.billable}`)]
            const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'pay-rates.csv'
            a.click()
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Export CSV
        </button>
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, email, or employee ID…"
        actions={
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Filter by department"
          >
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <EmsCard title="Total Billable FTEs" subtitle={String(users.filter((u) => u.billable).length)}>
          <StatusRail items={[{ label: 'Billable', value: users.filter((u) => u.billable).length }]} />
        </EmsCard>
        <EmsCard title="Avg Pay Rate" subtitle={formatMoney(computeAvgRate(users), 'USD')}>
          <StatusRail items={[{ label: 'Average', value: formatMoney(computeAvgRate(users), 'USD') + '/hr' }]} />
        </EmsCard>
        <EmsCard title="Rate Changes (30d)" subtitle={String(recentChanges)}>
          <StatusRail items={[{ label: 'Recent', value: recentChanges }]} />
        </EmsCard>
      </div>

      <EmsCard title="Current Rates" subtitle="Per-employee hourly rates">
        <DataTable columns={rateColumns(employeeBase)} data={users} pageSize={15} emptyTitle="No employees" emptyMessage="Employees matching your filters will appear here." />
      </EmsCard>

      <EmsCard title="Rate Change History" subtitle="Audit trail — all pay rate changes, newest first">
        {rateEntries.length > 0 ? (
          <TimelineRail items={rateEntries} />
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">No pay rate changes recorded yet.</p>
        )}
      </EmsCard>

      <EmsCard title="Department Summary" subtitle="Aggregated billable headcount and average rates">
        <DataTable columns={deptColumns} data={departmentStats} pageSize={10} emptyTitle="No departments yet" emptyMessage="Employees without a department will not be summarized." />
      </EmsCard>
    </div>
  )
}

function rateColumns(base: string): Column<EmsUser>[] {
  return [
  { key: 'name', label: 'Employee', sortable: true, render: (row) => <Link to={`${base}/${row.id}`} className="font-medium text-accent">{row.name}</Link> },
  { key: 'employeeId', label: 'ID', render: (row) => <span className="ems-tabular">{row.employeeId}</span> },
  { key: 'billable', label: 'Billable', align: 'center', render: (row) => <span className="text-xs">{row.billable ? 'Yes' : 'No'}</span> },
  { key: 'payRate', label: 'Pay Rate', align: 'right', render: (row) => row.payRate ? <span className="ems-tabular">{formatMoney(row.payRate, row.currency ?? 'USD')}/h</span> : <span className="text-muted-foreground">—</span> },
  { key: 'currency', label: 'Currency', render: (row) => <span className="text-sm">{row.currency ?? '—'}</span> },
  { key: 'department', label: 'Department', render: (row) => <span className="text-sm">{row.department ?? '—'}</span> },
  ]
}

const deptColumns: Column<DepartmentStats>[] = [
  { key: 'department', label: 'Department', sortable: true },
  { key: 'headcount', label: 'Headcount', align: 'right', render: (row) => <span className="ems-tabular">{row.headcount}</span> },
  { key: 'billable', label: 'Billable FTEs', align: 'right', render: (row) => <span className="ems-tabular">{row.billable}</span> },
  { key: 'avgRate', label: 'Avg Rate', align: 'right', render: (row) => <span className="ems-tabular">{formatMoney(row.avgRate, 'USD')}/h</span> },
]

function buildDepartmentStats(users: EmsUser[]): DepartmentStats[] {
  const byDepartment = new Map<string, EmsUser[]>()
  for (const user of users) {
    const dept = user.department ?? 'Unassigned'
    const bucket = byDepartment.get(dept)
    if (bucket) bucket.push(user)
    else byDepartment.set(dept, [user])
  }
  return Array.from(byDepartment.entries())
    .map(([department, members]) => {
      const billable = members.filter((u) => u.billable && u.payRate)
      const rateSum = billable.reduce((sum, u) => sum + (u.payRate ?? 0), 0)
      return {
        department,
        headcount: members.length,
        billable: members.filter((u) => u.billable).length,
        avgRate: billable.length > 0 ? rateSum / billable.length : 0,
      }
    })
    .sort((a, b) => b.headcount - a.headcount)
}

function computeAvgRate(users: EmsUser[]): number {
  const billable = users.filter((u) => u.billable && u.payRate)
  if (billable.length === 0) return 0
  return billable.reduce((sum, u) => sum + (u.payRate ?? 0), 0) / billable.length
}

function isWithin30Days(dateStr: string): boolean {
  const d = new Date(dateStr).getTime()
  if (Number.isNaN(d)) return false
  const diffDays = (NOW_MS - d) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= 30
}
