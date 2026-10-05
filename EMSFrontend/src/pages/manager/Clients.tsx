/**
 * Clients list page (EMSFrontend.md §7.6, Phase 6).
 * Master grid of EMS clients with KPI strip, filter bar, and create entry point.
 */
import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { KpiStrip } from '../../components/ems/KpiStrip'
import { KpiStat } from '../../components/ems/KpiStat'
import { EmsCard } from '../../components/ems/EmsCard'
import { DashboardShell } from '../../components/ems/DashboardShell'
import { DataTable, type Column } from '../../components/ems/DataTable'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { IntegrationStatusChip } from '../../components/ems/IntegrationStatusChip'
import { ClientIdBadge } from '../../components/ems/ClientIdBadge'
import { Plus, Search } from 'lucide-react'
import { getClients, getProjects } from '../../services/commercialService'
import { getReport } from '../../services/financeService'
import type { Client } from '../../types/client'
import type { Project } from '../../types/project'
import { formatMoney, formatNumber } from '../../utils/currency'
import { toLocalDateString } from '../../utils/date'

/** The live `/clients` payload carries `contractValue`, which `Client` omits. */
interface LiveClient extends Client {
  contractValue?: number
}

interface ClientsResponse {
  clients: LiveClient[]
  total: number
}

interface ClientWithStats extends Client {
  projectCount: number
  billableHoursMTD: number
  contractValue: number
}

export function ManagerClientsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState<ClientsResponse | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [hoursByClient, setHoursByClient] = useState<Record<string, number>>({})
  const [error, setError] = useState<Error | null>(null)
  const [search, setSearch] = useState('')
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    Promise.all([
      getClients(),
      getProjects(),
      // Hours are a secondary aggregate, so a report failure degrades the two
      // hour figures to zero rather than blanking the whole grid.
      getReport({
        dateRange: 'custom',
        startDate: toLocalDateString(monthStart),
        endDate: toLocalDateString(today),
        status: 'approved',
      })
        .then((report) => report.hoursByProject)
        .catch(() => []),
    ])
      .then(([clientsResult, projectsResult, hoursByProject]) => {
        if (cancelled) return
        const clientIdByProject = new Map<string, string>()
        for (const project of projectsResult.projects) {
          if (project.clientId) clientIdByProject.set(project.id, project.clientId)
        }
        const hours: Record<string, number> = {}
        for (const row of hoursByProject) {
          const clientId = clientIdByProject.get(row.projectId)
          if (!clientId) continue
          hours[clientId] = (hours[clientId] ?? 0) + row.totalHours
        }
        setData({ clients: clientsResult.clients as LiveClient[], total: clientsResult.total })
        setProjects(projectsResult.projects)
        setHoursByClient(hours)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load clients'))
          addToast('error', 'Could not load clients.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const clientsWithStats: ClientWithStats[] = useMemo(() => {
    if (!data) return []
    return data.clients.map((c) => ({
      ...c,
      projectCount: projects.filter((p) => p.clientId === c.id).length,
      billableHoursMTD: hoursByClient[c.id] ?? 0,
      contractValue: c.contractValue ?? 0,
    }))
  }, [data, projects, hoursByClient])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clientsWithStats.filter((c) => c.name.toLowerCase().includes(q) || c.clientCode.toLowerCase().includes(q))
  }, [clientsWithStats, search])

  const totalBillableHours = useMemo(() => filtered.reduce((sum, c) => sum + c.billableHoursMTD, 0), [filtered])
  const totalContractValue = useMemo(() => filtered.reduce((sum, c) => sum + c.contractValue, 0), [filtered])
  const projectsInFlight = useMemo(() => filtered.reduce((sum, c) => sum + c.projectCount, 0), [filtered])

  const columns: Column<ClientWithStats>[] = [
    {
      key: 'clientCode',
      label: 'ID',
      sortable: true,
      render: (row) => <ClientIdBadge id={row.clientCode} copyable />,
    },
    {
      key: 'name',
      label: 'Client',
      sortable: true,
      render: (row) => (
        <Link to={`/manager/clients/${row.id}`} className="font-medium text-accent hover:underline">
          {row.name}
        </Link>
      ),
    },
    {
      key: 'projectCount',
      label: 'Projects',
      sortable: true,
      align: 'right',
      render: (row) => <span className="ems-tabular">{row.projectCount}</span>,
    },
    {
      key: 'billableHoursMTD',
      label: 'Billable Hrs (MTD)',
      sortable: true,
      align: 'right',
      render: (row) => <span className="ems-tabular">{formatNumber(row.billableHoursMTD)}</span>,
    },
    {
      key: 'contractValue',
      label: 'Contract',
      sortable: true,
      align: 'right',
      render: (row) => <span className="ems-tabular">{formatMoney(row.contractValue)}</span>,
    },
    {
      key: 'syncStatus',
      label: 'Sync',
      sortable: true,
      render: (row) => <IntegrationStatusChip status={row.syncStatus as 'synced' | 'pending' | 'error'} />,
    },
  ]

  const handleCreate = () => {
    navigate('/manager/clients/new')
  }

  return (
    <DashboardShell
      title="Clients"
      subtitle={`Commercial pipeline · Signed in as ${user?.name ?? '…'}`}
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
        <>
          <KpiStrip>
            <KpiStat label="Active Clients" value={filtered.length} />
            <KpiStat label="Billable Hours (MTD)" value={formatNumber(totalBillableHours)} />
            <KpiStat label="Total Contract Value" value={formatMoney(totalContractValue)} />
            <KpiStat label="Projects in Flight" value={projectsInFlight} />
          </KpiStrip>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Input
                placeholder="Search clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={handleCreate}>
              New Client
            </Button>
          </div>

          <EmsCard title="Active Clients" subtitle={`${filtered.length} of ${data?.total ?? 0} clients`} padding="tight">
            <DataTable
              columns={columns}
              data={filtered}
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate(`/manager/clients/${row.id}`)}
              emptyTitle="No clients match"
              emptyMessage="Create a client to get started."
            />
          </EmsCard>
        </>
      )}
    </DashboardShell>
  )
}
