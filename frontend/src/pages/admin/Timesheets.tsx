import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, Eye } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate } from '../../utils/date'

export function Timesheets() {
  const { timesheets, users, projects } = useAppData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [weekStartFilter, setWeekStartFilter] = useState('')

  const userOptions = useMemo(() => users.map((u) => ({ value: u.id, label: u.name })), [users])
  const projectOptions = useMemo(() => projects.map((p) => ({ value: p.id, label: p.name })), [projects])

  const filteredTimesheets = useMemo(() => {
    return timesheets.filter((t) => {
      const employee = users.find((u) => u.id === t.userId)
      if (search.trim()) {
        const lower = search.toLowerCase()
        const matchesName = employee?.name.toLowerCase().includes(lower)
        const matchesProject = projects.find((p) => p.id === t.projectId)?.name.toLowerCase().includes(lower)
        if (!matchesName && !matchesProject) return false
      }
      if (userFilter && t.userId !== userFilter) return false
      if (projectFilter && t.projectId !== projectFilter) return false
      if (statusFilter && t.status !== statusFilter) return false
      if (weekStartFilter && t.weekStart !== weekStartFilter) return false
      return true
    })
  }, [timesheets, users, projects, search, userFilter, projectFilter, statusFilter, weekStartFilter])

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
        <h1 className="text-2xl font-semibold text-slate-900">Timesheets</h1>
        <p className="mt-1 text-sm text-slate-500">View and manage all timesheet submissions.</p>
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
            <div className="flex flex-wrap gap-3">
              <Select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-44" options={[{ value: '', label: 'All Employees' }, ...userOptions]} />
              <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-44" options={[{ value: '', label: 'All Projects' }, ...projectOptions]} />
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36" options={[{ value: '', label: 'All Statuses' }, { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }, { value: 'withdrawn', label: 'Withdrawn' }]} />
              <Input type="week" value={weekStartFilter} onChange={(e) => setWeekStartFilter(e.target.value)} className="w-40" />
              <Button variant="secondary" onClick={handleClear} leftIcon={<SlidersHorizontal className="h-4 w-4" />}>Clear</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredTimesheets.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No timesheets found" description="Get started by submitting a timesheet." />
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
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {timesheet.submittedAt ? formatDate(timesheet.submittedAt) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={timesheet.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/approvals')} leftIcon={<Eye className="h-4 w-4" />}>View</Button>
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
