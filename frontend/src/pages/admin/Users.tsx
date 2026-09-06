import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, SlidersHorizontal, Download, ChevronUp, ChevronDown, MoreHorizontal, UserCheck, Trash2 } from 'lucide-react'
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

export function Users() {
  const { users, deactivateUser, refreshUsers } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [supervisorFilter, setSupervisorFilter] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>('asc')

  const departments = useMemo(() => Array.from(new Set(users.map((u) => u.department))), [users])

  const filteredUsers = useMemo(() => {
    let data = users
    if (search.trim()) {
      const lower = search.toLowerCase()
      data = data.filter((u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower) || u.employeeId.toLowerCase().includes(lower))
    }
    if (departmentFilter) data = data.filter((u) => u.department === departmentFilter)
    if (statusFilter) data = data.filter((u) => u.status === statusFilter)
    if (supervisorFilter) data = data.filter((u) => u.isSupervisor === (supervisorFilter === 'true'))
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
  }, [users, search, departmentFilter, statusFilter, supervisorFilter, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleDeactivate = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to deactivate "${name}"?`)) return
    await deactivateUser(id)
    addToast('success', 'User deactivated successfully')
    refreshUsers()
  }

  const handleExport = () => {
    const headers = ['Name', 'Employee ID', 'Email', 'Department', 'Role', 'Status']
    const rows = filteredUsers.map((u) => [u.name, u.employeeId, u.email, u.department, u.role, u.status])
    const csvRows = rows.map((row) => row.map((cell) => '"' + String(cell ?? '') + '"').join(','))
    const csv = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const filename = 'users-' + new Date().toISOString().split('T')[0] + '.csv'
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    addToast('success', 'Users exported to CSV')
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <span className="text-slate-400" />
    return sortDir === 'asc' ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4 text-indigo-600" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Manage Alphanet users and permissions.</p>
        </div>
        <Button onClick={() => navigate('/admin/users/new')} leftIcon={<Plus className="h-4 w-4" />}>
          Create User
        </Button>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search by name, email, or employee ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className="w-40" options={[{ value: '', label: 'All Departments' }, ...departments.map((d) => ({ value: d, label: d }))]} />
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-32" options={[{ value: '', label: 'All Status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
              <Select value={supervisorFilter} onChange={(e) => setSupervisorFilter(e.target.value)} className="w-40" options={[{ value: '', label: 'All Roles' }, { value: 'true', label: 'Supervisors' }, { value: 'false', label: 'Non-Supervisors' }]} />
              <Button variant="secondary" onClick={() => { setSearch(''); setDepartmentFilter(''); setStatusFilter(''); setSupervisorFilter('') }} leftIcon={<SlidersHorizontal className="h-4 w-4" />}>Clear</Button>
              <Button variant="secondary" onClick={handleExport} leftIcon={<Download className="h-4 w-4" />}>Export</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredUsers.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<UserCheck className="h-12 w-12" />}
                title="No users found"
                description="Get started by creating a new user."
                action={<Button onClick={() => navigate('/admin/users/new')} leftIcon={<Plus className="h-4 w-4" />}>Create User</Button>}
              />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {[
                    { key: 'name', label: 'Name' },
                    { key: 'employeeId', label: 'Employee ID' },
                    { key: 'email', label: 'Email' },
                    { key: 'department', label: 'Department' },
                    { key: 'role', label: 'Role' },
                    { key: 'isSupervisor', label: 'Supervisor' },
                    { key: 'status', label: 'Status' },
                  ].map((col) => (
                    <th key={col.key} onClick={() => handleSort(col.key)} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-slate-700">
                      <span className="inline-flex items-center gap-1">{col.label}<SortIcon column={col.key} /></span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUsers.map((user) => {
                  return (
                    <tr key={user.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/users/${user.id}`)}>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-3">
                          <Avatar name={user.name} size="sm" />
                          <span className="font-medium text-slate-900">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{user.employeeId}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{user.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{user.department}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{user.role === 'admin' ? 'Admin' : 'User'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{user.isSupervisor ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                          {user.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                          trigger={
                            <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          }
                        >
                          <DropdownItem icon={<span className="text-xs">View</span>} onClick={() => navigate(`/admin/users/${user.id}`)}>View</DropdownItem>
                          <DropdownItem icon={<span className="text-xs">Edit</span>} onClick={() => navigate(`/admin/users/${user.id}/edit`)}>Edit</DropdownItem>
                          {user.status === 'active' && (
                            <DropdownItem icon={<Trash2 className="h-4 w-4 text-red-500" />} destructive onClick={() => handleDeactivate(user.id, user.name)}>Deactivate</DropdownItem>
                          )}
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
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 ${destructive ? 'text-red-600 hover:text-red-700' : 'text-slate-700'}`}>
      {icon}
      {children}
    </button>
  )
}
