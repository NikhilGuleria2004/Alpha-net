/**
 * Client detail page (EMSFrontend.md §7.6, Phase 6).
 * Tabs: Overview · Projects · Contacts · Activity.
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
import { ClientIdBadge } from '../../components/ems/ClientIdBadge'
import { IntegrationStatusChip } from '../../components/ems/IntegrationStatusChip'
import { TimelineRail } from '../../components/ems/TimelineRail'
import { DataTable, type Column } from '../../components/ems/DataTable'
import { Plus } from 'lucide-react'
import { getClient } from '../../services/commercialService'
import type { Client } from '../../types/client'
import type { Project } from '../../types/project'
import { formatMoney, formatNumber } from '../../utils/currency'
import { formatDate } from '../../utils/date'

interface ClientContact {
  name: string
  email: string
  phone: string
}

interface ActivityEntry {
  id: string
  description: string
  actor: string
  timestamp: string
  kind: string
}

interface ClientDetail {
  client: Client
  projects: Project[]
  contacts: ClientContact[]
  activity: ActivityEntry[]
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Projects' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'activity', label: 'Activity' },
] as const

export function ManagerClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  void user
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useQueryParamState('tab', 'overview')
  const [data, setData] = useState<ClientDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const showLoading = useDelayedLoading(!data && !error)

  useEffect(() => {
    if (!id) return
    getClient(id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load client'))
  }, [id])

  if (!id) {
    return <EmsCard title="Client Not Found" subtitle="No client ID was provided.">{null}</EmsCard>
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
    return <EmsCard title={data?.client?.name ?? 'Client'} subtitle={error}>{null}</EmsCard>
  }

  const { client: c, projects, contacts, activity } = data

  function renderTabContent(tabId: string) {
    switch (tabId) {
      case 'overview':
        return (
          <div className="space-y-4 pt-2">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">{c.name}</h2>
                <ClientIdBadge id={c.clientCode} />
              </div>
              <div className="flex items-center gap-2">
                <IntegrationStatusChip
                  status={c.syncStatus as 'synced' | 'pending' | 'error'}
                  label={c.syncStatus === 'synced' ? 'Timesheet Synced' : c.syncStatus === 'error' ? 'Sync Error' : 'Pending Sync'}
                  lastSync={c.updatedAt}
                />
                <Button size="sm" variant="secondary" onClick={() => addToast('info', `Sync queued for ${c.name}.`)}>
                  Retry sync
                </Button>
              </div>
            </div>

            <WidgetGrid columns={4}>
              <EmsCard title="Projects" subtitle="Active contracts" padding="tight">
                <p className="ems-tabular text-2xl font-semibold text-foreground">{projects.length}</p>
              </EmsCard>
              <EmsCard title="Total Billable Hours" subtitle="MTD" padding="tight">
                <p className="ems-tabular text-2xl font-semibold text-foreground">{formatNumber(projects.reduce((sum, p) => sum + (p.hourlyRate ?? 0), 0))}</p>
              </EmsCard>
              <EmsCard title="Payment Terms" subtitle="Net terms" padding="tight">
                <p className="text-sm font-semibold text-foreground">{c.paymentTerms ?? '—'}</p>
              </EmsCard>
              <EmsCard title="Contact Email" subtitle="Billing" padding="tight">
                <p className="text-sm font-semibold text-foreground">{c.contactEmail ?? '—'}</p>
              </EmsCard>
            </WidgetGrid>

            {c.description && (
              <EmsCard title="Description">
                <p className="text-sm text-foreground">{c.description}</p>
              </EmsCard>
            )}

            <EmsCard title="Billing Address">
              <p className="text-sm text-foreground">{c.billingAddress ?? 'No address on record.'}</p>
            </EmsCard>

            <EmsCard title="Client ID" subtitle="For the timesheet platform">
              <ClientIdBadge id={c.clientCode} copyable />
            </EmsCard>
          </div>
        )
      case 'projects':
        return (
          <div className="space-y-3 pt-2">
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/manager/projects/new', { state: { clientId: c.id }, replace: true })}>
              New Project
            </Button>
            <DataTable
              columns={projectColumns}
              data={projects}
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate(`/manager/projects/${row.id}`)}
              emptyTitle="No projects yet"
              emptyMessage="Create a project for this client to assign resources."
            />
          </div>
        )
      case 'contacts':
        return (
          <div className="space-y-2 pt-2">
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts on record.</p>
            ) : (
              contacts.map((contact) => (
                <div key={contact.email} className="rounded-lg border border-border p-3">
                  <strong className="text-sm font-medium text-foreground">{contact.name}</strong>
                  <p className="text-sm text-muted-foreground">{contact.email}</p>
                  <p className="text-sm text-muted-foreground">{contact.phone}</p>
                </div>
              ))
            )}
          </div>
        )
      case 'activity':
        return (
          <EmsCard title="Activity" subtitle={`Timeline for ${c.name}`} padding="tight">
            <TimelineRail
              items={activity.map((a) => ({
                id: a.id,
                title: a.description,
                description: `${a.actor} · ${a.kind}`,
                timestamp: a.timestamp,
              }))}
            />
            {activity.length === 0 && <p className="text-xs text-muted-foreground">No activity recorded yet.</p>}
          </EmsCard>
        )
    }
  }

  const tabs = TABS.map((t) => ({ id: t.id, label: t.label, content: renderTabContent(t.id) }))

  return (
    <div className="space-y-4">
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/manager/clients" className="hover:text-foreground">Clients</Link>
          <span>/</span>
          <span>{c.name}</span>
        </div>
      </nav>

      <Tabs tabs={tabs} value={tab} onValueChange={setTab} />
    </div>
  )
}

const projectColumns: Column<Project>[] = [
  {
    key: 'name',
    label: 'Project',
    sortable: true,
    render: (row) => (
      <Link to={`/manager/projects/${row.id}`} className="font-medium text-accent hover:underline">
        {row.name}
      </Link>
    ),
  },
  { key: 'sowNumber', label: 'SOW', sortable: true, render: (row) => <span className="ems-tabular">{row.sowNumber}</span> },
  { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant={row.status === 'active' ? 'success' : row.status === 'completed' ? 'info' : 'default'} size="sm">{row.status}</Badge> },
  { key: 'startDate', label: 'Start', sortable: true, render: (row) => <span className="ems-tabular">{formatDate(row.startDate)}</span> },
  { key: 'endDate', label: 'End', sortable: true, render: (row) => <span className="ems-tabular">{formatDate(row.endDate)}</span> },
  {
    key: 'hourlyRate',
    label: 'Rate',
    sortable: true,
    align: 'right',
    render: (row) => <span className="ems-tabular">{row.hourlyRate ? formatMoney(row.hourlyRate) : '—'}/hr</span>,
  },
]
