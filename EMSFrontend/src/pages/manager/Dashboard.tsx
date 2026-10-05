import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ManagerDashboardData } from '../../types/dashboard'
import { getManagerDashboard } from '../../services/dashboardService'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { KpiStrip } from '../../components/ems/KpiStrip'
import { KpiStat } from '../../components/ems/KpiStat'
import { EmsCard } from '../../components/ems/EmsCard'
import { WidgetGrid } from '../../components/ems/WidgetGrid'
import { DashboardShell } from '../../components/ems/DashboardShell'
import { BillableChip } from '../../components/ems/BillableChip'
import { ClientIdBadge } from '../../components/ems/ClientIdBadge'
import { formatPercent } from '../../utils/currency'
import { formatDate, isOverdue } from '../../utils/date'

const KPI_COUNT = 5

export function ManagerDashboard() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [data, setData] = useState<ManagerDashboardData | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getManagerDashboard()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load dashboard'))
          addToast('error', err instanceof Error ? err.message : 'Could not load dashboard.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  return (
    <DashboardShell
      title="Manager Dashboard"
      subtitle={`Commercial pipeline · Signed in as ${user?.name ?? '…'}`}
      kpiCount={KPI_COUNT}
      loading={loading}
      error={error}
      data={data}
      onRetry={() => {
        setData(null)
        setError(null)
      }}
    >
      {(d) => (
        <>
          {/* --- KPI strip (§7.3.3: 5) */}
          <KpiStrip>
            <KpiStat label="Active Clients" value={d.activeClients} />
            <KpiStat label="Active Projects" value={d.activeProjects} />
            <KpiStat label="Unassigned Resources" value={d.unassignedResources} />
            <KpiStat label="Utilization" value={formatPercent(d.utilizationPercent)} />
            <KpiStat label="Billable Hours (Week)" value={d.billableHoursWeek} delta={{ value: d.billableHoursWeek - 300, unit: 'h', label: 'vs target' }} />
          </KpiStrip>

          {/* --- 8/4 grid */}
          <WidgetGrid columns={3}>
            <div className="xl:col-span-2">
              <EmsCard title="Client / Project Pipeline" subtitle="Stage funnel">
                <div className="space-y-3">
                  {d.pipelineStages.map((stage) => (
                    <div key={stage.stage} className="flex items-center gap-2">
                      <span className="ems-overline w-24 shrink-0 text-muted-foreground">{stage.label}</span>
                      <div className="relative h-8 flex-1">
                        <div
                          className="absolute inset-0 rounded-md bg-accent/20"
                          style={{ width: `${(stage.count / Math.max(...d.pipelineStages.map((s) => s.count))) * 100}%` }}
                        />
                        <span className="ems-tabular absolute right-2 top-1.5 text-sm font-semibold text-foreground">{stage.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </EmsCard>
            </div>

            <div className="xl:col-span-1">
              <EmsCard title="Assignment Queue" subtitle="Employees awaiting assignment">
                <div className="space-y-2">
                  {d.assignmentQueue.map((r) => (
                    <div key={r.id} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <strong className="text-sm font-medium text-foreground">{r.name}</strong>
                        <BillableChip billable={r.billable} size="sm" />
                      </div>
                      <p className="ems-text-label text-muted-foreground">{r.employeeId} · {r.department}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.skills.map((s) => (
                          <span key={s} className="rounded bg-muted px-1.5 py-0.25 text-[10px] font-medium text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </EmsCard>
            </div>
          </WidgetGrid>

          {/* --- Lower band: 3-column */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <EmsCard title="Project Health" subtitle="SOW, team, deadline">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                        <th className="px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Team</th>
                        <th className="px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">% Staffed</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deadline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {d.projectHealth.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3 text-sm">
                            <Link to={`/manager/projects/${p.id}`} className="font-medium text-foreground">
                              {p.name}
                            </Link>
                            <p className="ems-text-label text-muted-foreground">{p.sowNumber}</p>
                          </td>
                          <td className="px-4 py-3">
                            <ClientIdBadge id={p.clientCode} copyable={false} />
                            <span className="ems-text-label text-muted-foreground">{p.clientName}</span>
                          </td>
                          <td className="px-4 py-3 ems-tabular text-center">{p.teamSize}</td>
                          <td className="px-4 py-3 ems-tabular text-center">{p.staffedPercent}%</td>
                          <td className={`px-4 py-3 ems-text-label ${isOverdue(p.deadline) ? 'text-destructive' : ''}`}>
                            {formatDate(p.deadline)}
                            {p.overdue && ' · Overdue'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </EmsCard>
            </div>

            <div className="space-y-4">
              <EmsCard title="Top Clients by Hours" subtitle="This month">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {d.topClientsByHours.map((c) => (
                        <tr key={c.id}>
                          <td className="px-4 py-3 text-sm">{c.clientCode}</td>
                          <td className="px-4 py-3 ems-tabular text-right">{c.billableHours}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </EmsCard>

              <EmsCard title="Capacity vs Demand" subtitle="By role">
                <div className="space-y-3">
                  {d.capacityVsDemand.map((c) => (
                    <div key={c.role} className="flex items-center gap-2">
                      <span className="ems-overline w-32 shrink-0 text-muted-foreground">{c.role}</span>
                      <div className="relative h-6 flex-1 rounded-md bg-muted">
                        <div
                          className="absolute inset-0 rounded-md bg-success/30"
                          style={{ width: `${Math.min((c.capacity / c.demand) * 100, 100)}%` }}
                        />
                        <span className="ems-tabular absolute right-2 top-0.5 text-[10px] font-medium text-foreground">
                          {c.capacity}/{c.demand}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </EmsCard>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  )
}
