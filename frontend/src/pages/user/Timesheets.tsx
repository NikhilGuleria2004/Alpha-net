import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, Eye, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate } from '../../utils/date'

export function Timesheets() {
  const { user } = useAuth()
  const { timesheets, projects, createTimesheet, refreshTimesheets } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newProjectId, setNewProjectId] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const myTimesheets = useMemo(() => {
    if (!user) return []
    return timesheets.filter((t) => t.userId === user.id)
  }, [timesheets, user])

  const projectOptions = useMemo(() => {
    const userProjects = projects.filter((p) => p.teamMemberIds.includes(user?.id || ''))
    return userProjects.map((p) => ({ value: p.id, label: p.name }))
  }, [user, projects])

  const filteredTimesheets = useMemo(() => {
    let data = myTimesheets
    if (search.trim()) {
      const lower = search.toLowerCase()
      data = data.filter((t) => {
        const project = projects.find((p) => p.id === t.projectId)
        return project?.name.toLowerCase().includes(lower) || project?.client.toLowerCase().includes(lower)
      })
    }
    if (projectFilter) data = data.filter((t) => t.projectId === projectFilter)
    if (statusFilter) data = data.filter((t) => t.status === statusFilter)
    if (dateRange) {
      const now = new Date()
      const cutoff = new Date()
      if (dateRange === '7d') cutoff.setDate(now.getDate() - 7)
      else if (dateRange === '30d') cutoff.setDate(now.getDate() - 30)
      else if (dateRange === '90d') cutoff.setDate(now.getDate() - 90)
      data = data.filter((t) => new Date(t.weekStart) >= cutoff)
    }
    return data
  }, [myTimesheets, projects, search, projectFilter, statusFilter, dateRange])

  const handleClear = () => {
    setSearch('')
    setProjectFilter('')
    setStatusFilter('')
    setDateRange('')
  }

  const handleCreateTimesheet = async () => {
    if (!user || !newProjectId) return
    setIsCreating(true)
    try {
      const today = new Date()
      const day = today.getDay()
      const diff = today.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(today.setDate(diff))
      const weekStart = monday.toISOString().split('T')[0]
      const timesheet = await createTimesheet({
        userId: user.id,
        projectId: newProjectId,
        weekStart,
        entries: [],
        notes: '',
      })
      await refreshTimesheets()
      addToast('success', 'Timesheet created')
      setIsCreateOpen(false)
      setNewProjectId('')
      navigate(`/user/timesheets/${timesheet.id}`)
    } catch {
      addToast('error', 'Failed to create timesheet')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My Timesheets</h1>
          <p className="mt-1 text-sm text-slate-500">View and manage your timesheet submissions.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>New Timesheet</Button>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search by project or client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="w-full sm:w-44" options={[{ value: '', label: 'All Projects' }, ...projectOptions]} />
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-36" options={[{ value: '', label: 'All Statuses' }, { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }, { value: 'withdrawn', label: 'Withdrawn' }]} />
              <Select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="w-full sm:w-36" options={[{ value: '', label: 'All Time' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }]} />
              <Button variant="secondary" onClick={handleClear} leftIcon={<SlidersHorizontal className="h-4 w-4" />} className="w-full sm:w-auto">Clear</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredTimesheets.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No timesheets found" description="You haven't submitted any timesheets matching the filters." />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Week</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Project</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Regular</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Overtime</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTimesheets.map((timesheet) => {
                  const project = projects.find((p) => p.id === timesheet.projectId)
                  const start = new Date(timesheet.weekStart)
                  const end = new Date(start)
                  end.setDate(end.getDate() + 4)
                  return (
                    <tr key={timesheet.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-700">{formatDate(start)} – {formatDate(end)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{project?.name || '-'}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{timesheet.regularHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{timesheet.overtimeHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{timesheet.totalHours.toFixed(1)}h</td>
                      <td className="px-4 py-3"><StatusBadge status={timesheet.status} size="sm" /></td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/user/timesheets/${timesheet.id}`)} leftIcon={<Eye className="h-4 w-4" />}>View</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {isCreateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCreateOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">New Timesheet</h3>
            <p className="mt-1 text-sm text-slate-500">Select a project to start a new timesheet for this week.</p>
            <div className="mt-4">
              <Select label="Project" value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} options={[{ value: '', label: 'Select project' }, ...projectOptions]} />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>Cancel</Button>
              <Button onClick={handleCreateTimesheet} loading={isCreating} disabled={!newProjectId}>Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
