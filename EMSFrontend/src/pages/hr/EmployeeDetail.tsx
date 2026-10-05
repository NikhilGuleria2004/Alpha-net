/**
 * Employee detail page (EMSFrontend.md §7.5, Phase 5 5.4).
 * Tabs: Overview · Pay & Billing · Attendance · Assignments · Documents · Activity
 */
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { Tabs } from '../../components/ui/Tabs'
import { RoleBadge } from '../../components/ems/RoleBadge'
import { BillableChip } from '../../components/ems/BillableChip'
import { EmployeeIdBadge } from '../../components/ems/EmployeeIdBadge'
import { EmsCard } from '../../components/ems/EmsCard'
import { TimelineRail } from '../../components/ems/TimelineRail'
import { StatusRail } from '../../components/ems/StatusRail'
import { DataTable } from '../../components/ems/DataTable'
import { Sparkline } from '../../components/ems/Sparkline'
import { canDeactivateUser } from '../../utils/permissions'
import { formatMoney } from '../../utils/currency'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useEmployeeBase } from '../../hooks/useEmployeeBase'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { getEmployeeDetail, getEmployees, type GetEmployeeDetailResponse } from '../../services/hrService'
import { getProjects } from '../../services/commercialService'
import { getReport } from '../../services/financeService'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { EmsUser } from '../../types/auth'
import type { EmsDocument } from '../../types/document'
import type { Project } from '../../types/project'
import type { Column } from '../../components/ems/DataTable'
import type { TimelineItem } from '../../components/ems/TimelineRail'
import { formatDate, formatDateAutoYear, toLocalDateString } from '../../utils/date'

const WEEK_DAYS = 7

/** Module-scope so no `new Date()` runs during render (react/purity). */
const ANCHOR_DATE = toLocalDateString(new Date())

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pay', label: 'Pay & Billing' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
] as const

export function HrEmployeeDetail() {
  const { id } = useParams<{ id: string }>()
  const { user: currentUser } = useAuth()
  const employeeBase = useEmployeeBase()
  const { addToast } = useToast()
  const [tab, setTab] = useQueryParamState('tab', 'overview')
  const [data, setData] = useState<GetEmployeeDetailResponse | null>(null)
  const [directory, setDirectory] = useState<EmsUser[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)
  const [weeklyHours, setWeeklyHours] = useState<number[]>([])
  const [hoursLoading, setHoursLoading] = useState(false)
  const showLoading = useDelayedLoading(!data && !error)

  const employee = data?.user ?? null

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getEmployeeDetail(id)
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load employee'
        setError(message)
        addToast('error', message)
      })
    return () => {
      cancelled = true
    }
  }, [id, addToast])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    // The directory backs the manager-name lookup and the admin deactivate guardrail.
    getEmployees()
      .then((res) => {
        if (!cancelled) setDirectory(res.users)
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load the employee directory.')
      })
    getProjects()
      .then((res) => {
        if (!cancelled) setProjects(res.projects)
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load projects.')
      })
    return () => {
      cancelled = true
    }
  }, [id, addToast])

  // The report endpoint has no per-day breakdown, so each of the last 7 days is
  // its own single-day query; the sparkline needs a 7-point series.
  useEffect(() => {
    if (!id || tab !== 'attendance') return
    let cancelled = false
    setWeeklyHours([])
    setHoursLoading(true)
    fetchDailyHours(id)
      .then((days) => {
        if (!cancelled) setWeeklyHours(days)
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load weekly hours.')
      })
      .finally(() => {
        if (!cancelled) setHoursLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, tab, addToast])

  if (showLoading) {
    return (
      <div className="p-4">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return <EmsCard title="Employee" subtitle={error}>{null}</EmsCard>
  }

  if (!employee) {
    return <EmsCard title="Employee Not Found" subtitle="No employee matches the provided ID.">{null}</EmsCard>
  }

  const emp = employee // narrowed non-null reference

  const payrateHistory = data?.payrateHistory ?? []
  const payRateEntries: TimelineItem[] = payrateHistory.map((p) => ({
    id: p.id,
    title: `$${p.newRate}/hr ${p.currency}`,
    description: `${p.reason ?? 'Pay rate change'} by ${p.changedBy}`,
    timestamp: p.createdAt,
    tone: p.oldRate === null ? 'success' : 'info',
  }))

  const documents = data?.documents ?? []
  const assignments = projects.filter((p) => p.teamMemberIds.includes(emp.id))
  const managerName = emp.managerId
    ? directory.find((u) => u.id === emp.managerId)?.name ?? emp.managerId
    : '—'

  const tabs = TABS.map((t) => ({
    id: t.id,
    label: t.label,
    content: renderTabContent(t.id),
  }))

  return (
    <div className="space-y-4">
      {/* Header band */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={emp.name} src={emp.avatarUrl} size="lg" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">{emp.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <EmployeeIdBadge id={emp.employeeId} />
              <RoleBadge role={emp.role} />
              <BillableChip billable={emp.billable} />
              <Badge variant={emp.status === 'active' ? 'success' : 'default'} size="sm">{emp.status}</Badge>
              {emp.department && <span className="text-sm text-muted-foreground">{emp.department}</span>}
              {emp.title && <span className="text-sm text-muted-foreground">· {emp.title}</span>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Joined {emp.joinedAt ? formatDate(emp.joinedAt) : '—'} · {emp.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`${employeeBase}/${emp.id}/edit`}>
            <Button variant="secondary" size="sm">Edit</Button>
          </Link>
          <EmployeeActionMenu employee={employee} directory={directory} currentUser={currentUser} />
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onValueChange={setTab} />

      <input type="hidden" aria-hidden={true} />
    </div>
  )

  function renderTabContent(tabId: string) {
    switch (tabId) {
      case 'overview':
        return (
          <div className="space-y-4 pt-2">
              <StatusRail className="mb-4" items={[
              { label: 'Role', value: <RoleBadge role={emp.role} /> },
              { label: 'Billable', value: <BillableChip billable={emp.billable} /> },
              { label: 'Employment', value: <span className="text-sm">{emp.employmentType?.replace('_', ' ') ?? '—'}</span> },
              { label: 'Manager', value: <span className="text-sm">{managerName}</span> },
              { label: 'Work Location', value: <span className="text-sm">{emp.title ?? '—'}</span> },
            ]} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <EmsCard title="Profile Details" subtitle="">
                <div className="space-y-2 text-sm">
                  <div><span className="text-muted-foreground">Title</span><span className="ml-2 font-medium text-foreground">{emp.title ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Department</span><span className="ml-2 font-medium text-foreground">{emp.department ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Employment Type</span><span className="ml-2 font-medium text-foreground">{emp.employmentType?.replace('_', ' ') ?? '—'}</span></div>
                  <div><span className="text-muted-foreground">Start Date</span><span className="ml-2 font-medium text-foreground">{emp.joinedAt ? formatDate(emp.joinedAt) : '—'}</span></div>
                </div>
              </EmsCard>

              <EmsCard title="Bill Rates" subtitle="Current hourly rates">
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Pay Rate</span>
                    <span className="ml-2 font-medium text-foreground">{emp.payRate ? formatMoney(emp.payRate, emp.currency!) + '/h' : '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Currency</span>
                    <span className="ml-2 font-medium text-foreground">{emp.currency ?? '—'}</span>
                  </div>
                </div>
              </EmsCard>
            </div>
          </div>
        )
      case 'pay':
        return (
          <EmsCard title="Pay Rate History" subtitle="All rate changes, in order">
            <TimelineRail items={payRateEntries} />
            {payrateHistory.length === 0 && <p className="text-xs text-muted-foreground">No rate changes recorded yet.</p>}
          </EmsCard>
        )
      case 'attendance':
        return (
          <EmsCard title="Weekly Hours" subtitle="Last 7 days">
            {hoursLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading hours…</div>
            ) : weeklyHours.some((h) => h > 0) ? (
              <Sparkline data={weeklyHours} height={120} ariaLabel="Weekly hours trend" />
            ) : (
              <p className="text-xs text-muted-foreground">No approved hours in the last 7 days.</p>
            )}
          </EmsCard>
        )
      case 'assignments':
        return (
          <EmsCard title="Project Assignments">
            {assignments.length > 0 ? (
              <DataTable columns={assignmentColumns} data={assignments} pageSize={10} />
            ) : (
              <p className="text-xs text-muted-foreground">No active assignments.</p>
            )}
          </EmsCard>
        )
      case 'documents':
        return (
          <EmsCard title="Documents">
            {documents.length > 0 ? (
              <DataTable columns={documentColumns} data={documents} pageSize={10} />
            ) : (
              <p className="text-xs text-muted-foreground">No documents on file.</p>
            )}
          </EmsCard>
        )
      case 'activity':
        return (
          <EmsCard title="Recent Activity">
            <TimelineRail items={payRateEntries.length > 0 ? payRateEntries.slice(0, 3) : [{ id: 'no-activity', title: 'No recent activity', description: 'Activity will appear here once recorded.', timestamp: '' }]} />
          </EmsCard>
        )
      default:
        return null
    }
  }
}

const assignmentColumns: Column<Project>[] = [
  { key: 'name', label: 'Project', render: (row) => <Link to={`/manager/projects/${row.id}`} className="font-medium text-accent">{row.name}</Link> },
  { key: 'client', label: 'Client', render: (row) => <span className="text-sm">{row.client}</span> },
  { key: 'status', label: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'} size="sm">{row.status}</Badge> },
  { key: 'hourlyRate', label: 'Rate', align: 'right', render: (row) => row.hourlyRate ? <span className="ems-tabular">{formatMoney(row.hourlyRate, 'USD')}/h</span> : <span className="text-muted-foreground">—</span> },
]

const documentColumns: Column<EmsDocument>[] = [
  { key: 'name', label: 'Document', render: (row) => <span className="font-medium">{row.name}</span> },
  { key: 'kind', label: 'Kind', render: (row) => <span className="text-sm">{row.kind.replace('_', ' ')}</span> },
  { key: 'status', label: 'Status', render: (row) => <Badge variant={row.status === 'verified' ? 'success' : row.status === 'expired' ? 'danger' : 'default'} size="sm">{row.status}</Badge> },
  { key: 'createdAt', label: 'Uploaded', render: (row) => <span className="ems-tabular text-xs">{formatDateAutoYear(row.createdAt)}</span> },
]

/** One single-day report query per point — the API returns no daily series. */
async function fetchDailyHours(userId: string): Promise<number[]> {
  const anchor = new Date(ANCHOR_DATE)
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const d = new Date(anchor)
    d.setDate(d.getDate() - (WEEK_DAYS - 1 - i))
    return toLocalDateString(d)
  })
  return Promise.all(
    days.map(async (day) => {
      const report = await getReport({ dateRange: 'custom', startDate: day, endDate: day, userId })
      return report.hoursByEmployee.find((row) => row.userId === userId)?.totalHours ?? 0
    }),
  )
}

function EmployeeActionMenu({
  employee,
  directory,
  currentUser,
}: {
  employee: EmsUser
  directory: EmsUser[]
  currentUser: EmsUser | null
}) {
  const deactivateCheck: { ok: boolean; reason?: string } = currentUser
    ? canDeactivateUser(currentUser, employee, directory)
    : { ok: true }

  return (
    <div className="flex items-center gap-2">
      {!deactivateCheck.ok && employee.status === 'active' && (
        <Badge variant="warning" size="sm" title={deactivateCheck.reason}>Protected</Badge>
      )}
      <Button variant={employee.status === 'active' ? 'danger' : 'secondary'} size="sm">
        {employee.status === 'active' ? 'Deactivate' : 'Activate'}
      </Button>
    </div>
  )
}
