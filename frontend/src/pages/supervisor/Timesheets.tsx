import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, Eye } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate } from '../../utils/date'

export function SupervisorTimesheets() {
  const { user } = useAuth()
  const { timesheets, users, projects } = useAppData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [weekStartFilter, setWeekStartFilter] = useState('')

  const supervisedProjectIds = useMemo(() => {
    if (!user) return new Set<string>()
    return new Set(projects.filter((p) => p.supervisorId === user.id).map((p) => p.id))
  }, [user, projects])

  const supervisedUserIds = useMemo(() => {
    if (!user) return new Set<string>()
    return new Set(users.filter((u) => u.supervisorId === user.id).map((u) => u.id))
  }, [user, users])

  const supervisedProjects = useMemo(() => projects.filter((p) => supervisedProjectIds.has(p.id)), [supervisedProjectIds, projects])
  const supervisedUsers = useMemo(() => users.filter((u) => supervisedUserIds.has(u.id)), [supervisedUserIds, users])

  const accessibleTimesheets = useMemo(() => {
    return timesheets.filter((t) => supervisedProjectIds.has(t.projectId) || supervisedUserIds.has(t.userId))
  }, [timesheets, supervisedProjectIds, supervisedUserIds])

  const userOptions = useMemo(() => supervisedUsers.map((u) => ({ value: u.id, label: u.name })), [supervisedUsers])
  const projectOptions = useMemo(() => supervisedProjects.map((p) => ({ value: p.id, label: p.name })), [supervisedProjects])

  const filteredTimesheets = useMemo(() => {
    let data = accessibleTimesheets
    if (search.trim()) {
      const lower = search.toLowerCase()
      data = data.filter((t) => {
        const employee = users.find((u) => u.id === t.userId)
        const project = projects.find((p) => p.id === t.projectId)
        return employee?.name.toLowerCase().includes(lower) || project?.name.toLowerCase().includes(lower)
      })
    }
    if (userFilter) data = data.filter((t) => t.userId === userFilter)
    if (projectFilter) data = data.filter((t) => t.projectId === projectFilter)
    if (statusFilter) data = data.filter((t) => t.status === statusFilter)
    if (weekStartFilter) data = data.filter((t) => t.weekStart === weekStartFilter)
    return data
  }, [accessibleTimesheets, users, projects, search, userFilter, projectFilter, statusFilter, weekStartFilter])

  const handleClear = () => {
    setSearch('')
    setUserFilter('')
    setProjectFilter('')
    setStatusFilter('')
    setWeekStartFilter('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Team Timesheets</h1>
        <p className="mt-1 text-sm text-slate-500">View timesheets for your team and supervised projects.</p>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search by employee or project..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <Select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-full sm:w-44" options={[{ value: '', label: 'All Employees' }, ...userOptions]} />
              <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-full sm:w-44" options={[{ value: '', label: 'All Projects' }, ...projectOptions]} />
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-36" options={[{ value: '', label: 'All Statuses' }, { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }, { value: 'withdrawn', label: 'Withdrawn' }]} />
              <Input type="week" value={weekStartFilter} onChange={(e) => setWeekStartFilter(e.target.value)} className="w-full sm:w-40" />
              <Button variant="secondary" onClick={handleClear} leftIcon={<SlidersHorizontal className="h-4 w-4" />} className="w-full sm:w-auto">Clear</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredTimesheets.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No timesheets found" description="There are no timesheets matching the filters." />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Week</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Regular</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Overtime</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Submitted</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTimesheets.map((timesheet) => {
                  const employee = users.find((u) => u.id === timesheet.userId)
                  const project = projects.find((p) => p.id === timesheet.projectId)
                  const start = new Date(timesheet.weekStart)
                  const end = new Date(start)
                  end.setDate(end.getDate() + 4)
                  return (
                    <tr key={timesheet.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-700">{employee?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{project?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(start)} – {formatDate(end)}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{timesheet.regularHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{timesheet.overtimeHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{timesheet.totalHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{timesheet.submittedAt ? formatDate(timesheet.submittedAt) : '-'}</td>
                      <td className="px-4 py-3"><StatusBadge status={timesheet.status} size="sm" /></td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/supervisor/approvals`)} leftIcon={<Eye className="h-4 w-4" />}>Review</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
