import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, CalendarDays } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { DeadlineIndicator } from '../../components/projects/DeadlineIndicator'
import { formatDate, toLocalDateString } from '../../utils/date'

export function Projects() {
  const { user } = useAuth()
  const { projects: appProjects, timesheets } = useAppData()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState('')

  const myProjects = useMemo(() => {
    if (!user) return []
    return appProjects.filter((p) => p.teamMemberIds.includes(user.id))
  }, [appProjects, user])

  const projectStatuses = useMemo(() => Array.from(new Set(myProjects.map((p) => p.status))), [myProjects])

  const filteredProjects = useMemo(() => {
    let data = myProjects
    if (search.trim()) {
      const lower = search.toLowerCase()
      data = data.filter((p) => p.name.toLowerCase().includes(lower) || p.client.toLowerCase().includes(lower))
    }
    if (statusFilter) data = data.filter((p) => p.status === statusFilter)
    if (deadlineFilter) {
      const now = new Date()
      const rangeMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
      const days = rangeMap[deadlineFilter] || 365
      const cutoff = new Date()
      cutoff.setDate(now.getDate() + days)
      data = data.filter((p) => new Date(p.deadline) <= cutoff && new Date(p.deadline) >= now)
    }
    return data
  }, [myProjects, search, statusFilter, deadlineFilter])

  const getCurrentWeekHours = (projectId: string) => {
    if (!user) return 0
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(today.setDate(diff))
    const weekStart = toLocalDateString(monday)
    const timesheet = timesheets.find((t) => t.userId === user.id && t.projectId === projectId && t.weekStart === weekStart)
    return timesheet?.totalHours || 0
  }

  const handleClear = () => {
    setSearch('')
    setStatusFilter('')
    setDeadlineFilter('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Projects</h1>
        <p className="mt-1 text-sm text-slate-500">Projects you are currently assigned to.</p>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search by project name or client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-40" options={[{ value: '', label: 'All Statuses' }, ...projectStatuses.map((s) => ({ value: s, label: s }))]} />
              <Select value={deadlineFilter} onChange={(e) => setDeadlineFilter(e.target.value)} className="w-full sm:w-40" options={[{ value: '', label: 'All Deadlines' }, { value: '7d', label: 'Next 7 days' }, { value: '30d', label: 'Next 30 days' }, { value: '90d', label: 'Next 90 days' }]} />
              <Button variant="secondary" onClick={handleClear} leftIcon={<SlidersHorizontal className="h-4 w-4" />} className="w-full sm:w-auto">Clear</Button>
            </div>
          </div>
        </div>

        <div className="p-5">
          {filteredProjects.length === 0 ? (
            <EmptyState title="No projects found" description="You are not assigned to any projects matching the filters." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProjects.map((project) => {
                const currentWeekHours = getCurrentWeekHours(project.id)
                return (
                  <div key={project.id} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 hover:bg-slate-50">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-900">{project.name}</h3>
                        <StatusBadge status={project.status} size="sm" />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{project.client}</p>
                      <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Due {formatDate(project.deadline)}
                        </span>
                        <DeadlineIndicator deadline={project.deadline} />
                      </div>
                      <div className="mt-3 text-xs text-slate-600">
                        <span className="font-medium">This week:</span> {currentWeekHours.toFixed(1)}h logged
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button size="sm" variant="secondary" className="w-full" onClick={() => navigate(`/user/projects/${project.id}`)}>Open Project</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
