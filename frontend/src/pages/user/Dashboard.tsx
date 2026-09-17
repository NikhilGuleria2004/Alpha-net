import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Clock3, ClipboardCheck, CalendarDays } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { StatCard } from '../../components/dashboard/StatCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { toLocalDateString, formatWeekRange } from '../../utils/date'

export function UserDashboard() {
  const { user } = useAuth()
  const { projects: appProjects, timesheets } = useAppData()
  const navigate = useNavigate()

  const myProjects = useMemo(() => {
    if (!user) return []
    return appProjects.filter((p) => p.teamMemberIds.includes(user.id))
  }, [appProjects, user])

  const myTimesheets = useMemo(() => {
    if (!user) return []
    return timesheets.filter((t) => t.userId === user.id)
  }, [timesheets, user])

  const currentWeekStart = useMemo(() => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(today.setDate(diff))
    return toLocalDateString(monday)
  }, [])

  // M7 (QA.md): timesheets are unique per (userId, projectId, weekStart), so a
  // user can have one per project this week. `.find()` used to return only the
  // first — "This Week" showed one project's hours and the card deep-linked to
  // an arbitrary timesheet. Sum across all current-week timesheets instead.
  const currentWeekTimesheets = useMemo(() => {
    return myTimesheets.filter((t) => t.weekStart === currentWeekStart)
  }, [myTimesheets, currentWeekStart])

  const thisWeekHours = useMemo(() => {
    return currentWeekTimesheets.reduce((sum, t) => sum + t.totalHours, 0)
  }, [currentWeekTimesheets])

  const thisWeekRegularHours = useMemo(() => {
    return currentWeekTimesheets.reduce((sum, t) => sum + t.regularHours, 0)
  }, [currentWeekTimesheets])

  const thisWeekOvertimeHours = useMemo(() => {
    return currentWeekTimesheets.reduce((sum, t) => sum + t.overtimeHours, 0)
  }, [currentWeekTimesheets])

  const pendingReviewCount = useMemo(() => {
    return myTimesheets.filter((t) => t.status === 'pending').length
  }, [myTimesheets])

  const upcomingDeadlines = useMemo(() => {
    const today = new Date()
    return myProjects
      .map((p) => ({
        ...p,
        daysRemaining: Math.ceil((new Date(p.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .filter((p) => p.daysRemaining > 0 && p.daysRemaining <= 60)
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 3)
  }, [myProjects])

  const recentSubmissions = useMemo(() => {
    return [...myTimesheets]
      .filter((t) => t.status !== 'draft')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
  }, [myTimesheets])

  const getProjectName = (id: string) => {
    const found = appProjects.find((p) => p.id === id)
    return found?.name || 'Unknown'
  }

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{greeting}, {user?.name?.split(' ')[0] || 'User'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here's your work overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="My Projects"
          value={myProjects.length}
          icon={<FolderKanban className="h-6 w-6" />}
          iconBgColor="bg-accent-soft text-accent"
          onClick={() => navigate('/user/projects')}
        />
        <StatCard
          title="This Week"
          value={`${thisWeekHours.toFixed(1)}h`}
          icon={<Clock3 className="h-6 w-6" />}
          iconBgColor="bg-success-soft text-success"
          onClick={() => navigate('/user/timesheets')}
        />
        <StatCard
          title="Pending Review"
          value={pendingReviewCount}
          icon={<ClipboardCheck className="h-6 w-6" />}
          iconBgColor="bg-warning-soft text-warning"
          onClick={() => navigate('/user/submissions')}
        />
        <StatCard
          title="Upcoming Deadline"
          value={upcomingDeadlines.length}
          icon={<CalendarDays className="h-6 w-6" />}
          iconBgColor="bg-error-soft text-destructive"
          onClick={() => navigate('/user/projects')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
<div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">Current Timesheet</h2>
            </div>
            <div className="p-5">
              {currentWeekTimesheets.length > 0 ? (
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {formatWeekRange(currentWeekTimesheets[0].weekStart)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Across {currentWeekTimesheets.length} project{currentWeekTimesheets.length === 1 ? '' : 's'}
                      </p>
                      <div className="mt-3 flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Regular</p>
                          <p className="text-lg font-semibold text-foreground">{thisWeekRegularHours.toFixed(1)}h</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Overtime</p>
                          <p className="text-lg font-semibold text-foreground">{thisWeekOvertimeHours.toFixed(1)}h</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Total</p>
                          <p className="text-lg font-semibold text-foreground">{thisWeekHours.toFixed(1)}h</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge status={currentWeekTimesheets[0].status} />
                      <button
                        type="button"
                        onClick={() => navigate('/user/timesheets')}
                        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-accent-hover"
                      >
                        Continue Timesheet
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<Clock3 className="h-12 w-12" />}
                  title="No timesheet for this week"
                  description="Create a timesheet to start tracking your hours."
                  action={
                    <button
                      type="button"
                      onClick={() => navigate('/user/timesheets')}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-accent-hover"
                    >
                  Create Timesheet
                    </button>
                  }
                />
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">Recent Submissions</h2>
            </div>
            <div className="overflow-x-auto">
              {recentSubmissions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No submissions yet"
                    description="Your submitted timesheets will appear here."
                  />
                </div>
              ) : (
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Week</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hours</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentSubmissions.map((timesheet) => {
                      return (
                        <tr
                          key={timesheet.id}
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => navigate(`/user/submissions`)}
                        >
                          <td className="px-4 py-3 text-sm text-foreground">
                            {formatWeekRange(timesheet.weekStart)}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">{getProjectName(timesheet.projectId)}</td>
                          <td className="px-4 py-3 text-right text-sm text-foreground">{timesheet.totalHours.toFixed(1)}h</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={timesheet.status} size="sm" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">My Projects</h2>
            </div>
            <div className="p-4">
              {myProjects.length === 0 ? (
                <EmptyState
                  title="No projects assigned"
                  description="Projects assigned to you will appear here."
                  action={
                    <button
                      type="button"
                      onClick={() => navigate('/user/dashboard')}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-accent-hover"
                    >
                      View Dashboard
                    </button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {myProjects.slice(0, 5).map((project) => (
                    <div key={project.id} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted">
                      <div>
                        <p className="text-sm font-medium text-foreground">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {project.client} • Due {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(project.deadline))}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/user/projects/${project.id}`)}
                        className="text-sm font-medium text-accent hover:text-accent-hover"
                      >
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">Upcoming Deadlines</h2>
            </div>
            <div className="p-4">
              {upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
              ) : (
                <div className="space-y-3">
                  {upcomingDeadlines.map((project) => (
                    <div key={project.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(project.deadline))}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ${project.daysRemaining <= 7 ? 'text-destructive' : 'text-warning'}`}>
                        {project.daysRemaining} days
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
