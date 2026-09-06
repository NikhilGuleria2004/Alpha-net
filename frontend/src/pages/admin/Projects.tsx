import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, SlidersHorizontal, Download, ChevronUp, ChevronDown, MoreHorizontal, FolderKanban, Trash2 } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown'
import { Avatar } from '../../components/ui/Avatar'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { formatDate } from '../../utils/date'

type SortDirection = 'asc' | 'desc'

export function Projects() {
  const { projects, users: appUsers, deleteProject, refreshProjects, isLoading } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [managerFilter, setManagerFilter] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const filteredProjects = useMemo(() => {
    let data = projects.filter((p) => p.status !== 'archived')
    if (search.trim()) {
      const lower = search.toLowerCase()
      data = data.filter((p) => p.name.toLowerCase().includes(lower) || p.sowNumber.toLowerCase().includes(lower) || p.client.toLowerCase().includes(lower))
    }
    if (statusFilter) data = data.filter((p) => p.status === statusFilter)
    if (managerFilter) data = data.filter((p) => p.managerId === managerFilter)
    if (sortKey) {
      data = [...data].sort((a, b) => {
        const aVal = a[sortKey as keyof typeof a]
        const bVal = b[sortKey as keyof typeof b]
        if (aVal === bVal) return 0
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        const comparison = String(aVal) < String(bVal) ? -1 : 1
        return sortDir === 'asc' ? comparison : -comparison
      })
    }
    return data
  }, [projects, search, statusFilter, managerFilter, sortKey, sortDir])

  const managers = useMemo(() => {
    const uniqueIds = Array.from(new Set(projects.map((p) => p.managerId)))
    return uniqueIds.map((id) => appUsers.find((u) => u.id === id)).filter(Boolean)
  }, [projects, appUsers])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return
    await deleteProject(id)
    addToast('success', 'Project deleted successfully')
    refreshProjects()
  }

  const handleExport = () => {
    const headers = ['Project', 'SOW', 'Client', 'Start', 'End', 'Deadline', 'Status']
    const rows = filteredProjects.map((p) => [p.name, p.sowNumber, p.client, formatDate(p.startDate), formatDate(p.endDate), formatDate(p.deadline), p.status])
    const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${String(cell ?? '')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `projects-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    addToast('success', 'Projects exported to CSV')
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <span className="text-slate-400" />
    return sortDir === 'asc' ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
          <p className="mt-1 text-sm text-slate-500">Manage Alphanet projects and statements of work.</p>
        </div>
        <Button onClick={() => navigate('/admin/projects/new')} leftIcon={<Plus className="h-4 w-4" />}>
          New Project
        </Button>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search projects by name, SOW, or client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-40" options={[{ value: '', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'completed', label: 'Completed' }, { value: 'overdue', label: 'Overdue' }, { value: 'archived', label: 'Archived' }]} />
              <Select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} className="w-full sm:w-48" options={[{ value: '', label: 'All Managers' }, ...managers.map((m) => ({ value: m!.id, label: m!.name }))]} />
              <Button variant="secondary" onClick={() => { setSearch(''); setStatusFilter(''); setManagerFilter('') }} leftIcon={<SlidersHorizontal className="h-4 w-4" />} className="w-full sm:w-auto">Clear</Button>
              <Button variant="secondary" onClick={handleExport} leftIcon={<Download className="h-4 w-4" />} className="w-full sm:w-auto">Export</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={8} columns={8} />
          ) : filteredProjects.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<FolderKanban className="h-12 w-12" />}
                title="No projects found"
                description="Get started by creating a new project."
                action={<Button onClick={() => navigate('/admin/projects/new')} leftIcon={<Plus className="h-4 w-4" />}>New Project</Button>}
              />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    { key: 'name', label: 'Project' },
                    { key: 'sowNumber', label: 'SOW' },
                    { key: 'client', label: 'Client' },
                    { key: 'startDate', label: 'Start' },
                    { key: 'endDate', label: 'End' },
                    { key: 'teamMemberIds', label: 'Team' },
                    { key: 'status', label: 'Status' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-slate-700"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <SortIcon column={col.key} />
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredProjects.map((project) => {
                  const manager = appUsers.find((u) => u.id === project.managerId)
                  return (
                    <tr key={project.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/projects/${project.id}`)}>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{project.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{project.sowNumber}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{project.client}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(project.startDate)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(project.endDate)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div className="flex items-center gap-1">
                          <Avatar name={manager?.name || ''} size="sm" />
                          <span>+{project.teamMemberIds.length}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={project.status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                          trigger={
                            <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          }
                        >
                          <DropdownItem icon={<span className="text-xs">Edit</span>} onClick={() => navigate(`/admin/projects/${project.id}/edit`)}>Edit</DropdownItem>
                          <DropdownItem icon={<Trash2 className="h-4 w-4 text-red-500" />} destructive onClick={() => handleDelete(project.id, project.name)}>Delete</DropdownItem>
                        </Dropdown>
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
