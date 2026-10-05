/**
 * Assignments page (EMSFrontend.md §7.7, Phase 6).
 * Board + table view toggle for the resource assignment queue.
 * Drag-and-drop or keyboard per-card "Assign to ▸" menu.
 */
import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { Board } from '../../components/ems/Board'
import { DataTable, type Column } from '../../components/ems/DataTable'
import { EmsCard } from '../../components/ems/EmsCard'
import { SlideOver } from '../../components/ems/SlideOver'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { ViewSwitcher, type EmsViewMode } from '../../components/ems/ViewSwitcher'
import { PayRateCell } from '../../components/ems/PayRateCell'
import {
  getAssignments,
  getAssignmentDemand,
  getClients,
  getProject,
  getProjects,
  createAssignment,
  unassignResource,
} from '../../services/commercialService'
import { getEmployees } from '../../services/hrService'
import { getManagerDashboard } from '../../services/dashboardService'
import { formatMoney, formatPercent } from '../../utils/currency'
import { toLocalDateString } from '../../utils/date'
import { assignmentMargin } from '../../types/assignment'
import type { Assignment } from '../../types/assignment'
import type { Client } from '../../types/client'
import type { Project } from '../../types/project'
import type { EmsUser, SupportedCurrencyCode } from '../../types/auth'
import type { ManagerDashboardData } from '../../types/dashboard'

const ASSIGNMENT_STATUSES = [
  { id: 'proposed', label: 'Proposed', emptyText: 'No proposed assignments' },
  { id: 'active', label: 'Active', emptyText: 'No active assignments' },
  { id: 'ending_soon', label: 'Ending Soon', emptyText: 'No ending assignments' },
  { id: 'ended', label: 'Ended', emptyText: 'No ended assignments' },
] as const

interface DemandItem {
  id: string
  projectName: string
  role: string
  skills: string[]
  seats: number
  filled: number
  startDate: string
  endDate: string
}

interface ResourceForAssign {
  id: string
  name: string
  employeeId: string
  department: string
  skills: string[]
  billable: boolean
  payRate: number | null
  currency: SupportedCurrencyCode
}

export function ManagerAssignmentsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  // `GET /employees` is admin/hr only, so the pay-rate directory is only asked
  // for when the session can read it; a manager resolves resource names from the
  // project rosters instead.
  const canReadDirectory = user?.role === 'admin' || user?.role === 'hr'
  const [view, setView] = useState<'board' | 'list'>('board')
  const [data, setData] = useState<{ assignments: Assignment[] } | null>(null)
  const [demand, setDemand] = useState<DemandItem[]>([])
  const [usersById, setUsersById] = useState<Map<string, EmsUser>>(() => new Map())
  const [resourceNames, setResourceNames] = useState<Map<string, string>>(() => new Map())
  const [projectsById, setProjectsById] = useState<Map<string, Project>>(() => new Map())
  const [clientsById, setClientsById] = useState<Map<string, Client>>(() => new Map())
  const [assignmentQueue, setAssignmentQueue] = useState<ManagerDashboardData['assignmentQueue']>([])
  const [error, setError] = useState<Error | null>(null)
  const [slideOverOpen, setSlideOverOpen] = useState(false)
  const [pendingAssignment, setPendingAssignment] = useState<{ resource: ResourceForAssign; project: DemandItem } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    const directory = canReadDirectory ? getEmployees().catch(() => null) : Promise.resolve(null)
    Promise.all([
      getAssignments(),
      getAssignmentDemand(),
      getProjects(),
      getClients(),
      // The queue (resources with no live assignment, with their skills) is an
      // aggregate of assignments + the roster, so it is served by the dashboard
      // endpoint rather than recomposed here.
      getManagerDashboard(),
      directory,
    ])
      .then(async ([a, d, projectsResult, clientsResult, dashboard, directoryResult]) => {
        const users = directoryResult?.users ?? []
        const names = new Map<string, string>(users.map((u) => [u.id, u.name]))
        // Resource names come from each assignment's project team roster — the
        // same ids the assignments dual-write onto `teamMemberIds`.
        const projectIds = [...new Set(a.assignments.map((x) => x.projectId).filter((pid) => pid.length > 0))]
        const details = await Promise.all(projectIds.map((pid) => getProject(pid).catch(() => null)))
        for (const detail of details) {
          if (!detail) continue
          for (const member of detail.team) names.set(member.userId, member.name)
        }
        for (const queued of dashboard.assignmentQueue) names.set(queued.id, queued.name)
        if (cancelled) return
        setData(a)
        setDemand(d.demands as DemandItem[])
        setUsersById(new Map(users.map((u) => [u.id, u])))
        setResourceNames(names)
        setProjectsById(new Map(projectsResult.projects.map((p) => [p.id, p])))
        setClientsById(new Map(clientsResult.clients.map((c) => [c.id, c])))
        setAssignmentQueue(dashboard.assignmentQueue)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load assignments'))
          addToast('error', 'Could not load assignments.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [addToast, reloadKey, canReadDirectory])

  const assignments = useMemo(() => data?.assignments ?? [], [data])

  const resourcesForAssign = useMemo<ResourceForAssign[]>(
    () =>
      assignmentQueue.map((r) => {
        const user = usersById.get(r.id)
        return {
          id: r.id,
          name: r.name,
          employeeId: r.employeeId,
          department: r.department,
          skills: r.skills,
          billable: r.billable,
          payRate: user?.payRate ?? null,
          currency: user?.currency ?? 'USD',
        }
      }),
    [assignmentQueue, usersById],
  )

  const availableResources = useMemo(
    () =>
      resourcesForAssign.filter(
        (r) => !assignments.some((a) => a.userId === r.id && (a.status === 'active' || a.status === 'ending_soon')),
      ),
    [resourcesForAssign, assignments],
  )

  const columnsData = useMemo(() =>
      ASSIGNMENT_STATUSES.map((status) => ({
        key: status.id,
        title: status.label,
        items: assignments.filter((a) => a.status === status.id),
        emptyText: status.emptyText,
        renderItem: (item: Assignment) => {
          const res = resourceNames.get(item.userId)
          const proj = projectsById.get(item.projectId)
          const cli = clientsById.get(item.clientId) ?? (proj?.clientId ? clientsById.get(proj.clientId) : undefined)
          const margin = assignmentMargin(item)
          return (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <strong className="text-sm font-medium text-foreground">{res ?? item.userId}</strong>
                {margin !== null && <span className="ems-tabular text-xs text-muted-foreground">{formatPercent(margin * 100)} margin</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                {proj?.name ?? item.projectId} · {formatMoney(item.billRate)}/hr
              </p>
              {cli && <p className="text-xs text-muted-foreground">{cli.clientCode}</p>}
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant={item.timesheetEnabled ? 'success' : 'default'} size="sm">
                  {item.timesheetEnabled ? 'Timesheet' : 'Pending'}
                </Badge>
                <Badge variant={item.ftePercent === 100 ? 'info' : 'default'} size="sm">
                  {formatPercent(item.ftePercent)} FTE
                </Badge>
              </div>
            </div>
          )
        },
      })),
    [assignments, resourceNames, projectsById, clientsById],
  )

  const handleMove = (assignment: Assignment, toStatus: string) => {
    addToast('info', `Moved ${assignment.id} to ${toStatus}.`)
  }

  const handleAssign = (resource: ResourceForAssign, project: DemandItem) => {
    setPendingAssignment({ resource, project })
    setSlideOverOpen(true)
  }

  const handleConfirmAssignment = async (billRate: number, ftePercent: number) => {
    if (!pendingAssignment) return
    const { resource, project } = pendingAssignment
    try {
      await createAssignment({
        userId: resource.id,
        // `demand` is keyed by project id, so it is the project id to post.
        projectId: project.id,
        billRate,
        // Left undefined when the directory is unreadable, so the backend falls
        // back to the resource's own pay rate instead of posting a fake zero.
        payRate: resource.payRate ?? undefined,
        currency: resource.currency,
        ftePercent,
        roleOnProject: project.role || undefined,
        startDate: toLocalDateString(new Date()),
        endDate: project.endDate,
      })
      addToast('success', `${resource.name} assigned to ${project.projectName}.`)
      setSlideOverOpen(false)
      setPendingAssignment(null)
      setReloadKey((k) => k + 1)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Could not create assignment.')
    }
  }

  const handleUnassign = async (assignmentId: string) => {
    try {
      await unassignResource(assignmentId)
      addToast('success', `Unassigned ${assignmentId}.`)
      setReloadKey((k) => k + 1)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Could not unassign resource.')
    }
  }

  if (error) {
    return <EmsCard title="Assignments" subtitle={error.message}>{null}</EmsCard>
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-lg border border-border" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Assignments</h1>
          <p className="text-sm text-muted-foreground">Resource allocation across active projects</p>
        </div>
        <ViewSwitcher value={view} onChange={(v) => setView(v === 'list' ? 'list' : 'board')} modes={['board', 'list'] as EmsViewMode[]} />
      </div>

      {view === 'board' ? (
        <>
          <Board
            columns={columnsData as any[]}
            onMove={handleMove}
            ariaLabel="Assignments board"
            className="mt-4"
          />

          <EmsCard title="Staffing Demand" subtitle="Roles that need resources" className="mt-4">
            <div className="space-y-3">
              {demand.map((d) => (
                <div key={d.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-sm font-medium text-foreground">{d.projectName}</strong>
                      <p className="text-xs text-muted-foreground">{d.role} · {d.skills.join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <span className="ems-tabular text-sm text-foreground">{d.filled}/{d.seats}</span>
                      {d.filled < d.seats && availableResources.length > 0 && (
                        <div className="mt-1">
                          <Button size="sm" variant="secondary" onClick={() => handleAssign(availableResources[0]!, d)}>
                            Assign
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {demand.length === 0 && <p className="text-sm text-muted-foreground">No open staffing demand.</p>}
              {demand.length > 0 && availableResources.length === 0 && (
                <p className="text-sm text-muted-foreground">No unassigned resources available for open demand.</p>
              )}
            </div>
          </EmsCard>
        </>
      ) : (
        <DataTable
          columns={assignmentTableColumns(resourceNames, projectsById)}
          data={assignments}
          getRowId={(row) => row.id}
          rowActions={(row) => (
            <Button size="sm" variant="ghost" onClick={() => handleUnassign(row.id)}>
              Unassign
            </Button>
          )}
          emptyTitle="No assignments"
          emptyMessage="No resource assignments have been created yet."
        />
      )}

      <SlideOver
        isOpen={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        title={pendingAssignment ? `Assign ${pendingAssignment.resource.name} to ${pendingAssignment.project.projectName}` : 'Assign Resource'}
      >
        {pendingAssignment && (
          <AssignmentForm resource={pendingAssignment.resource} project={pendingAssignment.project} onAssign={(billRate, ftePercent) => {
            handleConfirmAssignment(billRate, ftePercent)
          }} />
        )}
      </SlideOver>
    </div>
  )
}

function assignmentTableColumns(
  resourceNames: Map<string, string>,
  projectsById: Map<string, Project>,
): Column<Assignment>[] {
  return [
  {
    key: 'userId',
    label: 'Resource',
    sortable: true,
    render: (row) => {
      const name = resourceNames.get(row.userId)
      return <span className="font-medium text-foreground">{name ?? row.userId}</span>
    },
  },
  {
    key: 'projectId',
    label: 'Project',
    sortable: true,
    render: (row) => <span className="text-sm text-foreground">{projectsById.get(row.projectId)?.name ?? row.projectId}</span>,
  },
  { key: 'billRate', label: 'Bill Rate', sortable: true, align: 'right', render: (row) => <PayRateCell amount={row.billRate} currency={row.currency} /> },
  { key: 'payRate', label: 'Pay Rate', sortable: true, align: 'right', render: (row) => <PayRateCell amount={row.payRate} currency={row.currency} /> },
  { key: 'ftePercent', label: 'FTE', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatPercent(row.ftePercent)}%</span> },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (row) => (
      <Badge variant={row.status === 'active' ? 'success' : row.status === 'ended' ? 'default' : row.status === 'ending_soon' ? 'warning' : 'info'}>
        {row.status}
      </Badge>
    ),
  },
  { key: 'timesheetEnabled', label: 'Timesheet', sortable: true, render: (row) => <Badge variant={row.timesheetEnabled ? 'success' : 'default'} size="sm">{row.timesheetEnabled ? 'Enabled' : 'Pending'}</Badge> },
  ]
}

interface AssignmentFormProps {
  resource: ResourceForAssign
  project: DemandItem
  onAssign?: (billRate: number, ftePercent: number) => void
}

function AssignmentForm({ resource, project, onAssign }: AssignmentFormProps) {
  const [billRate, setBillRate] = useState(() => resource.payRate ? resource.payRate * 1.8 : 100)
  const [ftePercent, setFtePercent] = useState('100')

  const margin = resource.payRate ? (billRate - resource.payRate) / billRate : null

  return (
    <div className="space-y-4">
      <EmsCard title="Rate Configuration" padding="tight">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Bill Rate ($/hr)</label>
            <input
              type="number"
              min={resource.payRate ?? 0}
              value={billRate}
              onChange={(e) => setBillRate(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-card px-3 h-9 text-sm text-foreground"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">FTE (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={ftePercent}
              onChange={(e) => setFtePercent(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 h-9 text-sm text-foreground"
            />
          </div>
          <div className="flex justify-between rounded-lg border border-border p-3">
            <span className="text-sm text-muted-foreground">Margin</span>
            <span className="ems-tabular font-semibold text-foreground">
              {margin !== null ? formatPercent(margin * 100) : '—'}
            </span>
          </div>
        </div>
      </EmsCard>

      <EmsCard title="Resource Summary" subtitle={resource.name} padding="tight">
        <div className="space-y-1 text-sm">
          <div><span className="text-muted-foreground">Employee ID</span><span className="ml-2 font-medium text-foreground">{resource.employeeId}</span></div>
          <div><span className="text-muted-foreground">Department</span><span className="ml-2 font-medium text-foreground">{resource.department}</span></div>
          <div><span className="text-muted-foreground">Pay Rate</span><span className="ml-2 font-medium text-foreground">{resource.payRate ? formatMoney(resource.payRate) + '/hr' : '—'}</span></div>
          <div><span className="text-muted-foreground">Skills</span><span className="ml-2 font-medium text-foreground">{resource.skills.join(', ')}</span></div>
          <div><span className="text-muted-foreground">Project Role</span><span className="ml-2 font-medium text-foreground">{project.role}</span></div>
        </div>
      </EmsCard>

      <Button variant="primary" onClick={() => onAssign?.(billRate, Number(ftePercent))}>
        Assign Resource
      </Button>
    </div>
  )
}
