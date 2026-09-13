import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, Download, ChevronUp, ChevronDown, MoreHorizontal, UserCheck } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Dropdown } from '../../components/ui/Dropdown'
import { Avatar } from '../../components/ui/Avatar'

type SortDirection = 'asc' | 'desc'

export function Supervisors() {
  const { users, projects, timesheets } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const supervisors = useMemo(() => users.filter((u) => u.isSupervisor), [users])

  const departments = useMemo(() => Array.from(new Set(supervisors.map((u) => u.department))), [supervisors])

  const filteredSupervisors = useMemo(() => {
    let data = supervisors
    if (search.trim()) {
      const lower = search.toLowerCase()
      data = data.filter((u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower))
    }
    if (departmentFilter) data = data.filter((u) => u.department === departmentFilter)
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
  }, [supervisors, search, departmentFilter, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const getAssignedProjects = (userId: string) => {
    return projects.filter((p) => p.supervisorId === userId).length
  }

  const getTeamMembers = (userId: string) => {
    return users.filter((u) => u.supervisorId === userId).length
  }

  const getPendingReviews = (userId: string) => {
    const supervisedProjects = projects.filter((p) => p.supervisorId === userId).map((p) => p.id)
    const supervisedUsers = users.filter((u) => u.supervisorId === userId).map((u) => u.id)
    return timesheets.filter((t) => t.status === 'pending' && (supervisedProjects.includes(t.projectId) || supervisedUsers.includes(t.userId))).length
  }

  const handleExport = () => {
    const headers = ['Supervisor', 'Email', 'Department', 'Assigned Projects', 'Team Members', 'Pending Reviews', 'Status']
    const rows = filteredSupervisors.map((u) => [u.name, u.email, u.department, String(getAssignedProjects(u.id)), String(getTeamMembers(u.id)), String(getPendingReviews(u.id)), u.status])
    const csvRows = rows.map((row) => row.map((cell) => '"' + String(cell ?? '') + '"').join(','))
    const csv = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const filename = 'supervisors-' + new Date().toISOString().split('T')[0] + '.csv'
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    addToast('success', 'Supervisors exported to CSV')
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <span className="text-muted-foreground" />
    return sortDir === 'asc' ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Supervisors</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage supervisors and their assigned teams.</p>
        </div>
        <Button onClick={() => navigate('/admin/users/new')} leftIcon={<UserCheck className="h-4 w-4" />}>
          Create Supervisor
        </Button>
      </div>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="w-40" options={[{ value: '', label: 'All Departments' }, ...departments.map((d) => ({ value: d, label: d }))]} />
              <Button variant="secondary" onClick={() => { setSearch(''); setDepartmentFilter('') }} leftIcon={<SlidersHorizontal className="h-4 w-4" />}>Clear</Button>
              <Button variant="secondary" onClick={handleExport} leftIcon={<Download className="h-4 w-4" />}>Export</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredSupervisors.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<UserCheck className="h-12 w-12" />}
                title="No supervisors found"
                description="Get started by creating a new supervisor user."
                action={<Button onClick={() => navigate('/admin/users/new')} leftIcon={<UserCheck className="h-4 w-4" />}>Create Supervisor</Button>}
              />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-muted">
                <tr>
                  {[
                    { key: 'name', label: 'Supervisor' },
                    { key: 'email', label: 'Email' },
                    { key: 'department', label: 'Department' },
                    { key: 'assignedProjects', label: 'Assigned Projects' },
                    { key: 'teamMembers', label: 'Team Members' },
                    { key: 'pendingReviews', label: 'Pending Reviews' },
                    { key: 'status', label: 'Status' },
                  ].map((col) => (
                    <th key={col.key} onClick={() => handleSort(col.key === 'assignedProjects' || col.key === 'teamMembers' || col.key === 'pendingReviews' ? '' : col.key)} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground ${col.key !== 'assignedProjects' && col.key !== 'teamMembers' && col.key !== 'pendingReviews' ? 'cursor-pointer select-none hover:text-foreground' : ''}`}>
                      <span className="inline-flex items-center gap-1">{col.label}{col.key !== 'assignedProjects' && col.key !== 'teamMembers' && col.key !== 'pendingReviews' && <SortIcon column={col.key} />}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSupervisors.map((supervisor) => {
                  const assignedProjects = getAssignedProjects(supervisor.id)
                  const teamMembers = getTeamMembers(supervisor.id)
                  const pendingReviews = getPendingReviews(supervisor.id)
                  return (
                    <tr key={supervisor.id} className="cursor-pointer hover:bg-muted" onClick={() => navigate(`/admin/supervisors/${supervisor.id}`)}>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-3">
                          <Avatar name={supervisor.name} size="sm" />
                          <span className="font-medium text-foreground">{supervisor.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{supervisor.email}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{supervisor.department}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{assignedProjects}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{teamMembers}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span className={pendingReviews > 0 ? 'font-medium text-amber-600' : 'text-foreground'}>{pendingReviews}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${supervisor.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-foreground'}`}>
                          {supervisor.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                          trigger={
                            <button type="button" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          }
                        >
                          <DropdownItem icon={<span className="text-xs">View</span>} onClick={() => navigate(`/admin/supervisors/${supervisor.id}`)}>View</DropdownItem>
                          <DropdownItem icon={<span className="text-xs">Edit</span>} onClick={() => navigate(`/admin/users/${supervisor.id}/edit`)}>Edit</DropdownItem>
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

function DropdownItem({ children, onClick, icon, destructive }: { children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted ${destructive ? 'text-red-600 hover:text-red-700' : 'text-foreground'}`}>
      {icon}
      {children}
    </button>
  )
}
