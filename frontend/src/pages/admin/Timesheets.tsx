import { useMemo, useState } from 'react'
import { useQueryParamState, useDebouncedQueryParam } from '../../hooks/useQueryParamState'
import { Search, SlidersHorizontal, Eye, Download } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate, formatWeekRange } from '../../utils/date'
import { formatHours } from '../../utils/format'
import { downloadTimesheetsPdf } from '../../services/timesheetService'
import { failureMessage } from '../../utils/errorMessage'

export function Timesheets() {
  const { timesheets, users, projects } = useAppData()
  const { addToast } = useToast()
  const [isDownloading, setIsDownloading] = useState(false)
  // Guideline 1.11/1.23 → interface_guide.txt:15 ("URL as state") + interface_guide.txt:27 ("Deep-link everything"): all list controls are URL state.
  // F-20: the field stays instant (local state); only the URL write is debounced,
  // so a 12-character query is one navigation instead of twelve.
  const [search, setSearch] = useDebouncedQueryParam('q')
  const [userFilter, setUserFilter] = useQueryParamState('user', '', 'push')
  const [projectFilter, setProjectFilter] = useQueryParamState('project', '', 'push')
  const [statusFilter, setStatusFilter] = useQueryParamState('status', '', 'push')
  const [weekStartFilter, setWeekStartFilter] = useQueryParamState('week', '', 'push')

  const userOptions = useMemo(() => users.map((u) => ({ value: u.id, label: u.name })), [users])
  const projectOptions = useMemo(() => projects.map((p) => ({ value: p.id, label: p.name })), [projects])

  // Newest submissions first (QA: lists previously rendered oldest → newest).
  const filteredTimesheets = useMemo(() => {
    return timesheets
      .filter((t) => {
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
      .sort((a, b) => new Date(b.submittedAt ?? b.updatedAt).getTime() - new Date(a.submittedAt ?? a.updatedAt).getTime())
  }, [timesheets, users, projects, search, userFilter, projectFilter, statusFilter, weekStartFilter])

  const handleClear = () => {
    setSearch('')
    setUserFilter('')
    setProjectFilter('')
    setStatusFilter('')
    setWeekStartFilter('')
  }

  const handleDownloadDocument = async () => {
    setIsDownloading(true)
    try {
      const { blob, filename } = await downloadTimesheetsPdf({
        userId: userFilter || undefined,
        projectId: projectFilter || undefined,
        status: statusFilter || undefined,
        weekStart: weekStartFilter || undefined,
        search: search.trim() || undefined,
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename ?? `timesheet-report-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      addToast('success', 'Timesheet document downloaded successfully')
    } catch (err) {
      const message = failureMessage(err, {
        what: 'download timesheet document',
        reassurance: 'No data was modified',
        next: 'try again in a moment',
      })
      addToast('error', message)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Timesheets</h1>
          <p className="mt-1 text-sm text-muted-foreground">View and manage all timesheet submissions.</p>
        </div>
        <Button
          onClick={handleDownloadDocument}
          leftIcon={<Download className="h-4 w-4" />}
          loading={isDownloading}
        >
          Download Document
        </Button>
      </div>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search by employee or project…"
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
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Week</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Regular</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overtime</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submitted</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTimesheets.map((timesheet) => {
                  const employee = users.find((u) => u.id === timesheet.userId)
                  const project = projects.find((p) => p.id === timesheet.projectId)
                  return (
                    <tr key={timesheet.id} className="hover:bg-muted">
                      <td className="px-4 py-3 text-sm text-foreground">{employee?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{project?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatWeekRange(timesheet.weekStart)}</td>
                      <td className="px-4 py-3 text-right text-sm text-foreground">{formatHours(timesheet.regularHours)}</td>
                      <td className="px-4 py-3 text-right text-sm text-foreground">{formatHours(timesheet.overtimeHours)}</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-foreground">{formatHours(timesheet.totalHours)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {timesheet.submittedAt ? formatDate(timesheet.submittedAt) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={timesheet.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" to={'/admin/approvals'} leftIcon={<Eye className="h-4 w-4" />}>View</Button>
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
