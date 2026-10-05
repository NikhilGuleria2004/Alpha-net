import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EmployeeDashboardData } from '../../types/dashboard'
import { getEmployeeDashboard } from '../../services/dashboardService'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { KpiStrip } from '../../components/ems/KpiStrip'
import { KpiStat } from '../../components/ems/KpiStat'
import { EmsCard } from '../../components/ems/EmsCard'
import { WidgetGrid } from '../../components/ems/WidgetGrid'
import { DashboardShell } from '../../components/ems/DashboardShell'
import { AttendanceStatusDot } from '../../components/ems/AttendanceStatusDot'
import { Sparkline } from '../../components/ems/Sparkline'
import { formatMoney } from '../../utils/currency'
import { CalendarDays, ExternalLink, FileText, LogIn } from 'lucide-react'

const KPI_COUNT = 4

export function EmployeeDashboard() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [data, setData] = useState<EmployeeDashboardData | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getEmployeeDashboard()
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

  const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <DashboardShell
      title="My Dashboard"
      subtitle={`What do you need to do today? · Signed in as ${user?.name ?? '…'}`}
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
          {/* --- KPI strip (§7.3.5: 4) */}
          <KpiStrip>
            <KpiStat label="Attendance Streak" value={d.attendanceStreak} />
            <KpiStat label="Hours This Week" value={d.hoursThisWeek} sparkline={<Sparkline data={d.myWeekHours} height={32} ariaLabel="Hours this week" />} />
            <KpiStat label="Assigned Projects" value={d.assignedProjects} />
            <KpiStat label="Pending Leave Requests" value={d.pendingLeaveRequests} />
          </KpiStrip>

          {/* --- 7/5 grid */}
          <WidgetGrid columns={2}>
            <div>
              <EmsCard
                title="Today"
                subtitle={d.todayAttendance.nextAction}
                action={
                  !d.todayAttendance.marked ? (
                    <Link to="/me/attendance" className="text-xs font-medium text-accent">
                      Mark now
                    </Link>
                  ) : undefined
                }
              >
                <div className="flex items-center gap-4 py-2">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted/30">
                    <CalendarDays className="h-8 w-8 text-accent" aria-hidden="true" />
                  </div>
                  <div>
                    {d.todayAttendance.marked ? (
                      <>
                        <AttendanceStatusDot
                          status={(d.todayAttendance.status ?? 'present') as 'present' | 'remote' | 'late' | 'half_day' | 'on_leave' | 'absent' | 'holiday' | 'weekend'}
                          showLabel
                        />
                        <p className="ems-text-label mt-1 text-muted-foreground">Marked for today</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-foreground">Not marked</p>
                        <p className="ems-text-label text-muted-foreground">Mark your attendance for today.</p>
                      </>
                    )}
                  </div>
                </div>
              </EmsCard>
            </div>

            <div>
              <EmsCard title="My Week" subtitle="Logged hours (last 7 days)">
                <div className="flex items-end justify-between gap-1">
                  {d.myWeekHours.map((hours, index) => (
                    <div key={index} className="flex flex-col items-center">
                      <div
                        className="w-6 rounded-sm bg-accent/30"
                        style={{ height: `${Math.min((hours / 8) * 60, 60)}px` }}
                        title={`${hours}h — ${weekLabels[index]}`}
                        aria-label={`${weekLabels[index]}: ${hours} hours`}
                      />
                      <span className="ems-tabular mt-1 text-[10px] text-muted-foreground">{hours}</span>
                      <span className="ems-overline text-[10px] text-muted-foreground">{weekLabels[index].slice(0, 1)}</span>
                    </div>
                  ))}
                </div>
              </EmsCard>
            </div>
          </WidgetGrid>

          {/* --- Lower band: 2-column on large screens */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <EmsCard
                title="My Assignments"
                action={
                  <Link to="/manager/assignments" className="text-xs font-medium text-accent">
                    View all
                  </Link>
                }
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {d.myAssignments.map((a) => (
                        <tr key={a.id}>
                          <td className="px-4 py-3 text-sm">
                            <Link to={`/manager/projects/${a.id}`} className="font-medium text-foreground">
                              {a.name}
                            </Link>
                            <p className="ems-text-label text-muted-foreground">{a.role}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="ems-text-label text-muted-foreground">{a.clientCode}</span>
                            <span className="text-sm text-foreground">{a.clientName}</span>
                          </td>
                          <td className="px-4 py-3 ems-tabular text-right">
                            {a.billRate ? formatMoney(a.billRate, a.currency ?? 'USD') + '/h' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </EmsCard>
            </div>

            <div>
              <EmsCard
                title="Open Timesheet Handoff"
                subtitle={d.openTimesheetHandoff ? 'You are billable — log your hours in the timesheet platform.' : 'Timesheet access is for billable resources only.'}
              >
                {d.openTimesheetHandoff ? (
                  <a
                    href="https://timesheet.eniac.demo/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    Open Timesheet Platform
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <LogIn className="h-4 w-4" />
                    Your role does not require timesheet entry.
                  </p>
                )}
              </EmsCard>

              <EmsCard title="Documents to Sign" className="mt-4">
                {d.documentsToSign.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No documents to sign.</p>
                ) : (
                  <div className="space-y-2">
                    {d.documentsToSign.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          <span className="text-sm font-medium text-foreground">{doc.name}</span>
                        </div>
                        <Link
                          to={`/me/documents/${doc.id}`}
                          className="text-xs font-medium text-accent"
                        >
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </EmsCard>

              <EmsCard title="Recent Notifications" className="mt-4">
                {d.recentNotifications.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No new notifications.</p>
                ) : (
                  <div className="space-y-2">
                    {d.recentNotifications.map((n) => (
                      <div key={n.id} className="flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          <p className="ems-text-label text-muted-foreground">{n.message}</p>
                        </div>
                        <span
                          className={`ems-overline text-[10px] font-medium ${
                            n.read ? 'text-muted-foreground' : 'text-accent'
                          }`}
                        >
                          {n.read ? 'Read' : 'New'}
                        </span>
                      </div>
                    ))}
                    <Link to="/me/notifications" className="text-xs font-medium text-accent">
                      View all notifications
                    </Link>
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
