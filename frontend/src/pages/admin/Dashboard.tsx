import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Users, Clock3, CalendarDays } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { StatCard } from '../../components/dashboard/StatCard'
import { ActivityTimeline } from '../../components/dashboard/ActivityTimeline'
import { DeadlineCard } from '../../components/dashboard/DeadlineCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { differenceInDays, getCurrentWeekStart } from '../../utils/date'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function AdminDashboard() {
  const { user } = useAuth()
  const { projects: appProjects, users: appUsers, timesheets, activities } = useAppData()
  const navigate = useNavigate()

  const activeProjectsCount = useMemo(() => appProjects.filter((p) => p.status === 'active').length, [appProjects])
  const activeUsersCount = useMemo(() => appUsers.filter((u) => u.status === 'active').length, [appUsers])
  const pendingTimesheetsCount = useMemo(() => timesheets.filter((t) => t.status === 'pending').length, [timesheets])

  const upcomingDeadlines = useMemo(() => {
    const today = new Date()
    return appProjects
      .filter((p) => p.status !== 'archived')
      .map((p) => ({
        ...p,
        daysRemaining: differenceInDays(new Date(p.deadline), today),
      }))
      .filter((p) => p.daysRemaining >= -7 && p.daysRemaining <= 60)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 5)
  }, [appProjects])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { active: 0, completed: 0, overdue: 0, draft: 0 }
    for (const p of appProjects) {
      if (counts[p.status] !== undefined) {
        counts[p.status]++
      }
    }
    return counts
  }, [appProjects])

  const recentActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
  }, [activities])

  const pendingApprovals = useMemo(() => {
    return timesheets
      .filter((t) => t.status === 'pending')
      .slice(0, 5)
  }, [timesheets])

  const currentWeekTimesheets = useMemo(() => {
    const weekStart = getCurrentWeekStart()
    return timesheets.filter((t) => t.weekStart === weekStart)
  }, [timesheets])

  const getUserName = (id: string) => {
    const found = appUsers.find((u) => u.id === id)
    return found?.name || 'Unknown'
  }

  const getProjectName = (id: string) => {
    const found = appProjects.find((p) => p.id === id)
    return found?.name || 'Unknown'
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{getGreeting()}, {user?.name?.split(' ')[0] || 'Admin'}</h1>
        <p className="mt-1 text-sm text-slate-500">Here's what's happening across Eniac today.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Projects"
          value={activeProjectsCount}
          icon={<FolderKanban className="h-6 w-6" />}
          iconBgColor="bg-indigo-50 text-indigo-600"
          onClick={() => navigate('/admin/projects')}
        />
        <StatCard
          title="Active Users"
          value={activeUsersCount}
          icon={<Users className="h-6 w-6" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
          onClick={() => navigate('/admin/users')}
        />
        <StatCard
          title="Pending Timesheets"
          value={pendingTimesheetsCount}
          icon={<Clock3 className="h-6 w-6" />}
          iconBgColor="bg-amber-50 text-amber-600"
          onClick={() => navigate('/admin/approvals')}
        />
        <StatCard
          title="Upcoming Deadlines"
          value={upcomingDeadlines.filter((d) => d.daysRemaining > 0 && d.daysRemaining <= 14).length}
          icon={<CalendarDays className="h-6 w-6" />}
          iconBgColor="bg-red-50 text-red-600"
          onClick={() => navigate('/admin/projects')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="space-y-4 sm:space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-5 sm:py-4">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Timesheet Approvals</h2>
            </div>
            <div className="overflow-x-auto">
              {pendingApprovals.length === 0 ? (
                <div className="p-4 sm:p-6">
                  <EmptyState
                    icon={<Clock3 className="h-12 w-12" />}
                    title="You're all caught up"
                    description="There are no timesheets waiting for review."
                  />
                </div>
              ) : (
                <>
                  <table className="hidden min-w-full divide-y divide-slate-200 sm:block">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Project</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Week</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Hours</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Submitted</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pendingApprovals.map((timesheet) => {
                        const start = new Date(timesheet.weekStart)
                        const end = new Date(start)
                        end.setDate(end.getDate() + 4)
                        const submittedDate = timesheet.submittedAt ? new Date(timesheet.submittedAt) : null
                        return (
                          <tr key={timesheet.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/approvals`)}>
                            <td className="px-4 py-3 text-sm text-slate-700">{getUserName(timesheet.userId)}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{getProjectName(timesheet.projectId)}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(start)} – {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(end)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700">{timesheet.totalHours.toFixed(1)}h</td>
                            <td className="px-4 py-3 text-sm text-slate-500">
                              {submittedDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(submittedDate) : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={timesheet.status} size="sm" />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/admin/approvals`)
                                }}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                              >
                                Review
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div className="sm:hidden divide-y divide-slate-200">
                    {pendingApprovals.map((timesheet) => {
                      const start = new Date(timesheet.weekStart)
                      const end = new Date(start)
                      end.setDate(end.getDate() + 4)
                      const submittedDate = timesheet.submittedAt ? new Date(timesheet.submittedAt) : null
                      return (
                        <div key={timesheet.id} className="p-4" onClick={() => navigate(`/admin/approvals`)}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{getUserName(timesheet.userId)}</p>
                              <p className="text-xs text-slate-500 truncate">{getProjectName(timesheet.projectId)}</p>
                            </div>
                            <StatusBadge status={timesheet.status} size="sm" />
                          </div>
                          <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Week</span>
                              <span className="text-slate-700">{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(start)} – {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(end)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Hours</span>
                              <span className="font-medium text-slate-700">{timesheet.totalHours.toFixed(1)}h</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Submitted</span>
                              <span className="text-slate-700">{submittedDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(submittedDate) : '-'}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/admin/approvals`)
                            }}
                            className="mt-3 w-full rounded-lg bg-indigo-50 px-3 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-100"
                          >
                            Review
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-base font-semibold text-slate-900">Project Overview</h3>
              <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={status as 'active' | 'completed' | 'overdue' | 'draft'} size="sm" />
                    </div>
                    <span className="text-sm font-medium text-slate-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-base font-semibold text-slate-900">Hours This Week</h3>
              <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Regular Hours</span>
                  <span className="text-sm font-medium text-slate-900">
                    {currentWeekTimesheets.reduce((sum, t) => sum + t.regularHours, 0).toFixed(1)}h
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Overtime</span>
                  <span className="text-sm font-medium text-slate-900">
                    {currentWeekTimesheets.reduce((sum, t) => sum + t.overtimeHours, 0).toFixed(1)}h
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-2.5 sm:pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Total</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {currentWeekTimesheets.reduce((sum, t) => sum + t.totalHours, 0).toFixed(1)}h
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-5 sm:py-4">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Upcoming Deadlines</h2>
            </div>
            <div className="p-4 sm:p-5">
              {upcomingDeadlines.length === 0 ? (
                <EmptyState
                  title="No upcoming deadlines"
                  description="Projects approaching deadlines will appear here."
                />
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {upcomingDeadlines.map((project) => (
                    <DeadlineCard
                      key={project.id}
                      projectName={project.name}
                      deadline={project.deadline}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-4 sm:px-5 sm:py-4">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Recent Activity</h2>
            </div>
            <div className="p-4 sm:p-5">
              <ActivityTimeline
                items={recentActivities.map((activity) => ({
                  id: activity.id,
                  description: activity.description,
                  timestamp: activity.createdAt,
                  userName: getUserName(activity.userId),
                }))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
