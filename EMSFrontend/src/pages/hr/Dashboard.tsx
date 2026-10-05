import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HrDashboardData } from '../../types/dashboard'
import { getHrDashboard } from '../../services/dashboardService'
import { useAuth } from '../../contexts/AuthContext'
import { useEmployeeBase } from '../../hooks/useEmployeeBase'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { KpiStrip } from '../../components/ems/KpiStrip'
import { KpiStat } from '../../components/ems/KpiStat'
import { EmsCard } from '../../components/ems/EmsCard'
import { WidgetGrid } from '../../components/ems/WidgetGrid'
import { DashboardShell } from '../../components/ems/DashboardShell'
import { AttendanceStatusDot } from '../../components/ems/AttendanceStatusDot'
import { formatPercent } from '../../utils/currency'
import { formatDate, formatShortDate } from '../../utils/date'
import { Cake, Clock } from 'lucide-react'

const KPI_COUNT = 5

export function HrDashboard() {
  const { user } = useAuth()
  const employeeBase = useEmployeeBase()
  const { addToast } = useToast()
  const [data, setData] = useState<HrDashboardData | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getHrDashboard()
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

  const pipelineColumns = [
    { key: 'invited', label: 'Invited' },
    { key: 'docsPending', label: 'Docs Pending' },
    { key: 'payratePending', label: 'Payrate Pending' },
    { key: 'ready', label: 'Ready' },
    { key: 'active', label: 'Active' },
  ] as const

  return (
    <DashboardShell
      title="HR Dashboard"
      subtitle={`People operations · Signed in as ${user?.name ?? '…'}`}
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
          {/* --- KPI strip (§7.3.2: 5) */}
          <KpiStrip>
            <KpiStat label="Total Headcount" value={d.totalHeadcount} />
            <KpiStat label="New This Month" value={d.newThisMonth} />
            <KpiStat label="Pending Onboardings" value={d.pendingOnboardings} />
            <KpiStat label="On Leave Today" value={d.onLeaveToday} />
            <KpiStat
              label="Attendance Compliance"
              value={formatPercent(d.attendanceCompliance)}
              delta={{ value: d.attendanceCompliance - 90, unit: '%', label: 'vs target' }}
            />
          </KpiStrip>

          {/* --- 7/5 grid */}
          <WidgetGrid columns={2}>
            <div>
              <EmsCard
                title="Onboarding Pipeline"
                action={<Link to="/hr/onboarding" className="text-xs font-medium text-accent">View pipeline</Link>}
              >
                <div className="grid grid-cols-5 gap-1 text-center">
                  {pipelineColumns.map((col) => {
                    const value =
                      col.key === 'invited'
                        ? d.onboardingPipeline.invited
                        : col.key === 'docsPending'
                          ? d.onboardingPipeline.docsPending
                          : col.key === 'payratePending'
                            ? d.onboardingPipeline.payratePending
                            : col.key === 'ready'
                              ? d.onboardingPipeline.ready
                              : d.onboardingPipeline.active
                    return (
                      <div key={col.key}>
                        <div className="ems-tabular text-xl font-semibold text-foreground">{value}</div>
                        <p className="ems-overline text-muted-foreground">{col.label}</p>
                      </div>
                    )
                  })}
                </div>
              </EmsCard>
            </div>

            <div>
              <EmsCard title="Attendance Exceptions" subtitle="Late or absent today">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Employee</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {d.attendanceExceptions.map((e) => (
                        <tr key={e.id}>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <strong className="font-medium text-foreground">{e.employeeName}</strong>
                              <span className="ems-text-label text-muted-foreground">{e.employeeId}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <AttendanceStatusDot
                              status={e.status as 'present' | 'remote' | 'late' | 'half_day' | 'on_leave' | 'absent' | 'holiday' | 'weekend'}
                              showLabel
                            />
                          </td>
                          <td className="px-4 py-3 ems-text-label text-muted-foreground">{e.reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </EmsCard>
            </div>
          </WidgetGrid>

          {/* --- Lower band: 3-column */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div>
              <EmsCard title="Payrate Changes Pending" subtitle="Awaiting approval">
                {d.payrateChangesPending.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No pending changes.</p>
                ) : (
                  <div className="space-y-2">
                    {d.payrateChangesPending.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.employeeName}</p>
                          <p className="ems-text-label text-muted-foreground">{p.employeeId} · ${p.proposedRate}/hr</p>
                        </div>
                        <Link to={`${employeeBase}/${p.id}/edit`} className="text-xs font-medium text-accent">
                          Review
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </EmsCard>
            </div>

            <div>
              <EmsCard title="Upcoming Birthdays &amp; Anniversaries" subtitle="Next 30 days">
                {d.upcomingBirthdays.length === 0 && d.upcomingAnniversaries.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No upcoming events.</p>
                ) : (
                  <div className="space-y-3">
                    {d.upcomingBirthdays.map((b) => (
                      <div key={b.id} className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                        <Cake className="h-5 w-5 text-accent" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{b.name}</p>
                          <p className="ems-text-label text-muted-foreground">Birthday {formatShortDate(b.date)}</p>
                        </div>
                      </div>
                    ))}
                    {d.upcomingAnniversaries.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                        <Clock className="h-5 w-5 text-accent" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{a.name}</p>
                          <p className="ems-text-label text-muted-foreground">
                            {a.years} year{a.years !== 1 ? 's' : ''} · {formatShortDate(a.date)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </EmsCard>
            </div>

            <div>
              <EmsCard title="Leave Calendar" subtitle="People on leave">
                <div className="h-48">
                  {d.leaveCalendar.filter((l) => l.count > 0).length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">No leave scheduled.</p>
                  ) : (
                    <div className="space-y-1">
                      {d.leaveCalendar.filter((l) => l.count > 0).map((l) => (
                        <div key={l.date} className="flex items-center justify-between text-sm">
                          <span className="ems-text-label text-muted-foreground">{formatShortDate(l.date)}</span>
                          <span className="ems-tabular font-medium text-foreground">
                            {l.count} person{l.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </EmsCard>

              <EmsCard title="Document Expiries" className="mt-3">
                {d.documentExpiries.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No expiring documents.</p>
                ) : (
                  <div className="space-y-2">
                    {d.documentExpiries.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{doc.employeeName}</p>
                          <p className="ems-text-label text-muted-foreground">
                            {doc.kind} · expires {formatDate(doc.expiresAt)}
                          </p>
                        </div>
                        <span
                          className={`ems-text-label text-xs font-medium ${
                            doc.status === 'verified'
                              ? 'text-success'
                              : doc.status === 'expired'
                                ? 'text-destructive'
                                : 'text-warning'
                          }`}
                        >
                          {doc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </EmsCard>
            </div>
          </div>
        </>
      )}
    </DashboardShell>
  )
}
