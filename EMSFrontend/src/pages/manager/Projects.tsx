/**
 * Projects list page (EMSFrontend.md §7.7, Phase 6).
 * Grid of EMS projects with KPI strip and create entry point.
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
import { Badge } from '../../components/ui/Badge'
import { Plus, Search } from 'lucide-react'
import { getProjects, getClients, getAssignmentDemand } from '../../services/commercialService'
import { formatMoney, formatPercent, formatNumber } from '../../utils/currency'
import { formatDate, isOverdue } from '../../utils/date'
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_VARIANTS } from '../../utils/projectStatus'
import type { Project } from '../../types/project'
import type { Client } from '../../types/client'

interface ProjectsResponse {
  projects: Project[]
  total: number
}

interface ProjectWithStats extends Project {
  teamSize: number
  staffedPercent: number
}

export function ManagerProjectsPage() {
  const { user } = useAuth()
  void user
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [data, setData] = useState<ProjectsResponse | null>(null)
  const [clientsById, setClientsById] = useState<Map<string, Client>>(() => new Map())
  const [demandData, setDemandData] = useState<{ demands: unknown[] } | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [search, setSearch] = useState('')
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    Promise.all([getProjects(), getClients()])
      .then(([projectsResult, clientsResult]) => {
        if (cancelled) return
        setData(projectsResult)
        setClientsById(new Map(clientsResult.clients.map((c) => [c.id, c])))
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load projects'))
          addToast('error', 'Could not load projects.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  useEffect(() => {
    let cancelled = false
    getAssignmentDemand()
      .then((result) => {
        if (!cancelled) setDemandData(result)
      })
      .catch(() => {
        if (!cancelled) setDemandData({ demands: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const projectsWithStats: ProjectWithStats[] = useMemo(() => {
    if (!data) return []
    return data.projects.map((p) => ({
      ...p,
      teamSize: p.teamMemberIds.length,
      staffedPercent: Math.round((p.teamMemberIds.length / 4) * 100),
    }))
  }, [data])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return projectsWithStats.filter((p) => p.name.toLowerCase().includes(q) || p.sowNumber.toLowerCase().includes(q))
  }, [projectsWithStats, search])

  const activeCount = useMemo(() => filtered.filter((p) => p.status === 'active').length, [filtered])
  const overdueCount = useMemo(() => filtered.filter((p) => isOverdue(p.endDate)).length, [filtered])
  const openDemand = useMemo(() => (demandData?.demands?.length ?? 0), [demandData])

  const columns: Column<ProjectWithStats>[] = [
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
    {
      key: 'sowNumber',
      label: 'SOW',
      sortable: true,
      render: (row) => <span className="ems-tabular">{row.sowNumber}</span>,
    },
    {
      key: 'client',
      label: 'Client',
      sortable: true,
      render: (row) => {
        const client = row.clientId ? clientsById.get(row.clientId) : undefined
        return <span className="text-sm">{client?.name ?? row.client}</span>
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <Badge variant={PROJECT_STATUS_VARIANTS[row.status]} size="sm">
          {PROJECT_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: 'startDate',
      label: 'Start',
      sortable: true,
      render: (row) => <span className="ems-tabular">{formatDate(row.startDate)}</span>,
    },
    {
      key: 'endDate',
      label: 'End',
      sortable: true,
      render: (row) => <span className="ems-tabular">{formatDate(row.endDate)}</span>,
    },
    {
      key: 'hourlyRate',
      label: 'Rate',
      sortable: true,
      align: 'right',
      render: (row) => <span className="ems-tabular">{row.hourlyRate ? formatMoney(row.hourlyRate) + '/hr' : '—'}</span>,
    },
    {
      key: 'teamSize',
      label: 'Team',
      sortable: true,
      align: 'right',
      render: (row) => <span className="ems-tabular">{row.teamSize} ({formatPercent(row.staffedPercent)})</span>,
    },
  ]

  return (
    <DashboardShell
      title="Projects"
      subtitle="Project and assignment pipeline"
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
            <KpiStat label="Active Projects" value={activeCount} />
            <KpiStat label="Overdue" value={overdueCount} />
            <KpiStat label="Open Demand" value={openDemand} />
            <KpiStat label="Projects" value={formatNumber(filtered.length)} />
          </KpiStrip>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Input
                placeholder="Search projects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/manager/projects/new')}>
              New Project
            </Button>
          </div>

          <EmsCard title="Active Projects" subtitle={`${filtered.length} of ${data?.total ?? 0} projects`} padding="tight">
            <DataTable
              columns={columns}
              data={filtered}
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate(`/manager/projects/${row.id}`)}
              emptyTitle="No projects match"
              emptyMessage="Create a project to get started."
            />
          </EmsCard>
        </>
      )}
    </DashboardShell>
  )
}
