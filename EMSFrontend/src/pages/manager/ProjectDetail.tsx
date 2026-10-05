/**
 * Project detail page (EMSFrontend.md §7.7, Phase 6).
 * Tabs: Overview · Assignments · Team · Documents · Activity.
 */
import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Tabs } from '../../components/ui/Tabs'
import { EmsCard } from '../../components/ems/EmsCard'
import { WidgetGrid } from '../../components/ems/WidgetGrid'
import { TimelineRail } from '../../components/ems/TimelineRail'
import { DataTable, type Column } from '../../components/ems/DataTable'
import { StatusRail } from '../../components/ems/StatusRail'
import { PayRateCell } from '../../components/ems/PayRateCell'
import { Plus, ExternalLink } from 'lucide-react'
import { getProject, getClients } from '../../services/commercialService'
import { formatMoney, formatPercent, formatNumber } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_VARIANTS } from '../../utils/projectStatus'
import { assignmentMargin } from '../../types/assignment'
import type { Project } from '../../types/project'
import type { Assignment } from '../../types/assignment'
import type { Client } from '../../types/client'

interface TeamMember {
  userId: string
  name: string
  role: string
}

interface ProjectDocument {
  id: string
  name: string
  kind: string
  uploadedAt: string
}

interface ProjectDetailData {
  project: Project
  assignments: Assignment[]
  team: TeamMember[]
  documents: ProjectDocument[]
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'team', label: 'Team' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
] as const

export function ManagerProjectDetailPage() {
  const now = Date.now()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  void user
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useQueryParamState('tab', 'overview')
  const [data, setData] = useState<ProjectDetailData | null>(null)
  const [clientsById, setClientsById] = useState<Map<string, Client>>(() => new Map())
  const [error, setError] = useState<string | null>(null)
  const showLoading = useDelayedLoading(!data && !error)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    // The project payload names its client only by id, so the client is hydrated
    // from the live client list; the resource names already ride along on the
    // project's own team roster.
    Promise.all([getProject(id), getClients()])
      .then(([projectResult, clientsResult]) => {
        if (cancelled) return
        setData(projectResult)
        setClientsById(new Map(clientsResult.clients.map((c) => [c.id, c])))
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load project'
        setError(message)
        addToast('error', message)
      })
    return () => {
      cancelled = true
    }
  }, [id, addToast])

  if (!id) {
    return <EmsCard title="Project Not Found" subtitle="No project ID was provided.">{null}</EmsCard>
  }

  if (showLoading || !data) {
    return (
      <div className="p-4">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return <EmsCard title={data?.project?.name ?? 'Project'} subtitle={error}>{null}</EmsCard>
  }

  const { project: p, assignments, team, documents } = data
  const client = p.clientId ? clientsById.get(p.clientId) : undefined
  const resourceNames = new Map(team.map((m) => [m.userId, m.name]))
  const columns = assignmentColumns(resourceNames)

  function renderTabContent(tabId: string) {
    switch (tabId) {
      case 'overview':
        return (
          <div className="space-y-4 pt-2">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">{p.name}</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>SOW: {p.sowNumber}</span>
                  <span>·</span>
                  <Link to={`/manager/clients/${p.clientId ?? ''}`} className="hover:text-foreground">
                    {client?.name ?? p.client}
                  </Link>
                </div>
              </div>
              <Badge variant={PROJECT_STATUS_VARIANTS[p.status]} size="sm">
                {PROJECT_STATUS_LABELS[p.status]}
              </Badge>
            </div>

            <StatusRail items={[
              { label: 'Start Date', value: <span className="ems-tabular">{formatDate(p.startDate)}</span> },
              { label: 'End Date', value: <span className="ems-tabular">{formatDate(p.endDate)}</span> },
              { label: 'Deadline', value: <span className="ems-tabular">{p.deadline}</span> },
              { label: 'Team Size', value: <span className="ems-tabular">{p.teamMemberIds.length} members</span> },
              { label: 'Default Rate', value: <span className="ems-tabular">{p.hourlyRate ? formatMoney(p.hourlyRate) + '/hr' : '—'}</span> },
            ]} />

            <WidgetGrid columns={4}>
              <EmsCard title="Billable Hours (MTD)" subtitle="Team total" padding="tight">
                <p className="ems-tabular text-2xl font-semibold text-foreground">{formatNumber(assignments.reduce((sum, a) => sum + a.ftePercent, 0))}</p>
              </EmsCard>
              <EmsCard title="Avg. Margin" subtitle="Across assignments" padding="tight">
                <p className="ems-tabular text-2xl font-semibold text-foreground">
                  {formatPercent(Math.round(assignments.reduce((sum, a) => { const m = assignmentMargin(a); return sum + (m ?? 0) }, 0) / (assignments.length || 1) * 100))}
                </p>
              </EmsCard>
              <EmsCard title="Billable Resources" subtitle="Active assignments" padding="tight">
                <p className="ems-tabular text-2xl font-semibold text-foreground">{assignments.filter((a) => a.status === 'active').length}</p>
              </EmsCard>
              <EmsCard title="Days to Deadline" subtitle="From today" padding="tight">
                <p className="ems-tabular text-2xl font-semibold text-foreground">
                  {p.deadline ? Math.ceil((new Date(p.deadline).getTime() - now) / (1000 * 60 * 60 * 24)) : '—'}
                </p>
              </EmsCard>
            </WidgetGrid>

            <EmsCard title="Description">
              <p className="text-sm text-foreground">{p.description ?? 'No description available.'}</p>
            </EmsCard>

            <EmsCard title="Actions">
              <div className="flex gap-2">
                <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/manager/assignments/new', { state: { projectId: p.id }, replace: true })}>
                  Assign Resource
                </Button>
                <Button variant="ghost" leftIcon={<ExternalLink className="h-4 w-4" />} onClick={() => addToast('info', `Opening timesheet for ${p.name}.`)}>
                  View in Timesheet
                </Button>
              </div>
            </EmsCard>
          </div>
        )
      case 'assignments':
        return (
          <div className="space-y-3 pt-2">
            <DataTable
              columns={columns}
              data={assignments}
              getRowId={(row) => row.id}
              onRowClick={(row) => addToast('info', `Assignment ${row.id}`)}
              emptyTitle="No assignments"
              emptyMessage="Assign a resource to this project to get started."
            />
          </div>
        )
      case 'team':
        return (
          <div className="space-y-2 pt-2">
            {team.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members assigned.</p>
            ) : (
              team.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <span className="text-sm font-medium text-foreground">{m.name}</span>
                  <span className="text-sm text-muted-foreground">{m.role}</span>
                </div>
              ))
            )}
          </div>
        )
      case 'documents':
        return (
          <div className="space-y-2 pt-2">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            ) : (
              documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <span className="font-medium text-foreground">{d.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{d.kind}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(d.uploadedAt)}</span>
                </div>
              ))
            )}
          </div>
        )
      case 'activity':
        return (
          <EmsCard title="Activity" subtitle={`Timeline for ${p.name}`} padding="tight">
            <TimelineRail
              items={assignments.map((a) => ({
                id: a.id,
                title: `Assignment created (${a.roleOnProject ?? 'Resource'})`,
                description: `${formatMoney(a.billRate)}/hr · ${a.ftePercent}% FTE`,
                timestamp: a.createdAt,
              }))}
            />
            {assignments.length === 0 && <p className="text-xs text-muted-foreground">No activity recorded yet.</p>}
          </EmsCard>
        )
    }
  }

  const tabs = TABS.map((t) => ({ id: t.id, label: t.label, content: renderTabContent(t.id) }))

  return (
    <div className="space-y-4">
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/manager/projects" className="hover:text-foreground">Projects</Link>
          <span>/</span>
          <span>{p.name}</span>
        </div>
      </nav>

      <Tabs tabs={tabs} value={tab} onValueChange={setTab} />
    </div>
  )
}

function assignmentColumns(resourceNames: Map<string, string>): Column<Assignment>[] {
  return [
  {
    key: 'roleOnProject',
    label: 'Resource',
    sortable: true,
    render: (row) => {
      const name = resourceNames.get(row.userId)
      const margin = assignmentMargin(row)
      return (
        <div>
          <span className="font-medium text-foreground">{name ?? row.userId}</span>
          <span className="ml-2 text-xs text-muted-foreground">{row.roleOnProject ?? '—'}</span>
          <div className="mt-0.5">
            <span className="text-xs text-muted-foreground">Margin: {margin !== null ? formatPercent(margin * 100) : '—'}</span>
          </div>
        </div>
      )
    },
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
