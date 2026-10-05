import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { AdminDashboardData } from '../../types/dashboard'
import { getAdminDashboard } from '../../services/dashboardService'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { KpiStrip } from '../../components/ems/KpiStrip'
import { KpiStat } from '../../components/ems/KpiStat'
import { EmsCard } from '../../components/ems/EmsCard'
import { WidgetGrid } from '../../components/ems/WidgetGrid'
import { DashboardShell } from '../../components/ems/DashboardShell'
import { ClientIdBadge } from '../../components/ems/ClientIdBadge'
import { IntegrationStatusChip } from '../../components/ems/IntegrationStatusChip'
import { TimelineRail, type TimelineItem } from '../../components/ems/TimelineRail'
import { LazyLineChart, LazyBarChart, LazyDonutChart } from '../../components/ems/LazyChart'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'

const KPI_COUNT = 6

export function AdminDashboard() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getAdminDashboard()
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
      title="Admin Dashboard"
      subtitle={`Platform overview · Signed in as ${user?.name ?? '…'}`}
      kpiCount={KPI_COUNT}
      loading={loading}
      error={error}
      data={data}
      onRetry={() => {
        setData(null)
        setError(null)
      }}
    >
      {(d) => {
        const headcountPoints = d.headcountTrend.map((p) => ({ label: p.date, value: p.count }))
        const attendanceRatePoints = d.attendanceRate.filter((r) => r.present > 0).map((r) => ({ label: r.date, value: Math.round(r.rate * 100) }))
        const roleDistBars = d.roleDistribution.map((r) => ({ label: r.role, value: r.count }))
        const auditItems: TimelineItem[] = d.recentAudit.map((a) => ({
          id: a.id,
          title: a.description,
          description: a.actor,
          timestamp: a.timestamp,
          tone: a.severity === 'error' ? 'danger' : a.severity === 'warning' ? 'warning' : 'info',
        }))

        return (
          <>
            {/* --- KPI strip (§7.3.1: 6) */}
            <KpiStrip>
              <KpiStat
                label="Active Employees"
                value={d.activeEmployees.total}
                delta={{ value: d.activeEmployees.billable - d.activeEmployees.nonBillable, label: `${d.activeEmployees.billable} billable` }}
              />
              <KpiStat label="Billable / Non-billable" value={`${d.activeEmployees.billable}/${d.activeEmployees.nonBillable}`} />
              <KpiStat label="Open Client IDs" value={d.openClientIds} />
              <KpiStat label="Active Projects" value={d.activeProjects} />
              <KpiStat
                label="Attendance Today"
                value={`${d.attendanceToday.present}/${d.attendanceToday.present + d.attendanceToday.absent}`}
                delta={{ value: d.attendanceToday.late, label: 'late', unit: '' }}
              />
              <KpiStat
                label="Revenue at Risk"
                value={formatMoney(d.revenueAtRisk.amount, d.revenueAtRisk.currency)}
                delta={{ value: d.revenueAtRisk.projectCount, label: 'open SOWs' }}
              />
            </KpiStrip>

            {/* --- 8/4 grid */}
            <WidgetGrid columns={3}>
              <div className="xl:col-span-2">
                <EmsCard title="Platform Health" subtitle="Headcount trend (last 5 weeks)">
                  <LazyLineChart data={headcountPoints} height={160} ariaLabel="Headcount trend" />
                </EmsCard>
              </div>

              <div className="xl:col-span-1 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <EmsCard title="Attendance Rate">
                  <LazyBarChart data={attendanceRatePoints} height={140} ariaLabel="Attendance rate bar" />
                </EmsCard>
                <EmsCard title="Project Status">
                  <LazyDonutChart
                    data={d.projectStatusDonut.map((p) => ({ label: p.status, value: p.count }))}
                    height={140}
                    ariaLabel="Project status distribution"
                    legend={false}
                  />
                </EmsCard>
              </div>
            </WidgetGrid>

            {/* --- Lower band: 3-column */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div>
                <EmsCard title="Upcoming Renewals &amp; PO Burn" subtitle="Renewals in the next 30 days">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                          <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">PO Burn</th>
                          <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deadline</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-card">
                        {d.upcomingRenewals.map((r) => (
                          <tr key={r.id}>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex items-center gap-2">
                                <ClientIdBadge id={r.clientCode} copyable={false} />
                                <Link to={`/admin/clients/${r.id}`} className="font-medium text-foreground">
                                  {r.clientName}
                                </Link>
                              </div>
                            </td>
                            <td className="px-4 py-3 ems-tabular text-right">{formatMoney(r.poBurn, r.currency)}</td>
                            <td className="px-4 py-3 ems-text-label">{formatDate(r.deadline)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </EmsCard>
              </div>

              <div>
                <EmsCard title="Role Distribution">
                  <LazyBarChart data={roleDistBars} height={160} ariaLabel="Role distribution bar chart" />
                </EmsCard>
              </div>

              <div>
                <EmsCard title="Latest Onboardings">
                  <TimelineRail
                    items={d.latestOnboardings.map((o) => ({
                      id: o.id,
                      title: o.employeeName,
                      description: `Status: ${o.status}`,
                      timestamp: o.startedAt,
                      tone: o.status === 'active' ? 'success' : 'warning',
                    }))}
                  />
                </EmsCard>
              </div>
            </div>

            {/* --- System panel */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <EmsCard
                title="Recent Audit Events"
                action={d.recentAudit.length > 0 && <Link to="/admin/audit" className="text-xs font-medium text-accent">View all</Link>}
              >
                <TimelineRail items={auditItems} />
              </EmsCard>

              <EmsCard title="Integration Status" subtitle={`${d.failedLogins} failed login attempts in the last 24h`}>
                <div className="space-y-2">
                  {d.integrations.map((i) => (
                    <div key={i.system} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                      <span className="text-sm font-medium text-foreground">{i.system}</span>
                      <IntegrationStatusChip status={i.status} detail={i.detail} lastSync={i.lastSync} />
                    </div>
                  ))}
                </div>
              </EmsCard>
            </div>
          </>
        )
      }}
    </DashboardShell>
  )
}
