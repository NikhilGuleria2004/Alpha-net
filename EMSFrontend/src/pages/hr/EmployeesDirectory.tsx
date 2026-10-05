import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DataTable } from '../../components/ems/DataTable'
import { FilterBar } from '../../components/ems/FilterBar'
import { ViewSwitcher } from '../../components/ems/ViewSwitcher'
import { EmsCard } from '../../components/ems/EmsCard'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useEmployeeBase } from '../../hooks/useEmployeeBase'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import type { Column } from '../../components/ems/DataTable'
import { BillableChip } from '../../components/ems/BillableChip'
import { RoleBadge } from '../../components/ems/RoleBadge'
import { EmployeeIdBadge } from '../../components/ems/EmployeeIdBadge'
import { PayRateCell } from '../../components/ems/PayRateCell'
import { getEmployees, type GetEmployeesResponse } from '../../services/hrService'
import { useToast } from '../../contexts/ToastContext'
import type { EmsUser } from '../../types/auth'
import { formatDate } from '../../utils/date'

export function HrEmployeesDirectory() {
  // Employee management is served under /admin too, so detail links must follow
  // the namespace the admin is actually in (see useEmployeeBase).
  const employeeBase = useEmployeeBase()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useQueryParamState('q', '')
  const [view, setView] = useQueryParamState('view', 'list')
  const [statusFilter, setStatusFilter] = useQueryParamState('status', '')
  const [roleFilter, setRoleFilter] = useQueryParamState('role', '')
  const [deptFilter, setDeptFilter] = useQueryParamState('dept', '')

  const [data, setData] = useState<GetEmployeesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { addToast } = useToast()

  useEffect(() => {
    let cancelled = false
    const q = searchParams.get('q') ?? ''
    getEmployees(q)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load employees'
        setError(message)
        addToast('error', message)
      })
    return () => {
      cancelled = true
    }
  }, [searchParams, addToast])

  const allUsers = data?.users ?? []
  const filteredUsers = applyFilters(allUsers, statusFilter, roleFilter, deptFilter, search)

  const [selected, setSelected] = useState<string[]>([])

  if (!data && !error) {
    return (
      <div className="p-4">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg border border-border" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <EmsCard title="Employees" subtitle={error}>{null}</EmsCard>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Employees</h1>
        <Link to="/hr/onboarding/new">
          <Button variant="primary">Add Employee</Button>
        </Link>
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employees…"
        chips={[
          { id: 'status', label: 'Status', active: !!statusFilter, onToggle: () => setStatusFilter(statusFilter ? '' : 'active') },
          { id: 'role', label: 'Role', active: !!roleFilter, onToggle: () => setRoleFilter(roleFilter ? '' : 'employee') },
          { id: 'dept', label: 'Dept', active: !!deptFilter, onToggle: () => setDeptFilter(deptFilter ? '' : 'Engineering') },
        ]}
        onClearAll={() => {
          setSearch('')
          setStatusFilter('')
          setRoleFilter('')
          setDeptFilter('')
        }}
        savedViews={<span className="text-xs text-muted-foreground">Saved: default</span>}
        actions={
          <>
            {selected.length > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSelected([])} disabled={selected.length === 0}>Clear</Button>
                <Button variant="ghost" size="sm">Export CSV</Button>
                <Button variant="ghost" size="sm">Resend Invites</Button>
              </div>
            )}
            <ViewSwitcher value={view as 'list' | 'grid'} onChange={(v) => setView(v)} modes={['list', 'grid']} />
          </>
        }
      />

      {view === 'grid' ? (
        renderGridView()
      ) : (
        <DataTable
          columns={columns(employeeBase)}
          data={filteredUsers}
          getRowId={(u) => u.id}
          selectable={selected.length > 0 || true}
          selectedIds={selected}
          onSelectionChange={setSelected}
          onRowClick={(u) => { if (!selected.length) void u }}
          pageSize={15}
          emptyTitle="No employees"
          emptyMessage="Employees matching your filters will appear here."
        />
      )}
    </div>
  )

  function renderGridView() {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {filteredUsers.length} {filteredUsers.length === 1 ? 'person' : 'people'}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredUsers.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No employees match these filters.</p>
          )}
          {filteredUsers.map((u) => (
            <div key={u.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-3">
                <Avatar name={u.name} src={u.avatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  <EmployeeIdBadge id={u.employeeId} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <RoleBadge role={u.role} size="sm" />
                <BillableChip billable={u.billable} size="sm" />
                {u.payRate && <PayRateCell amount={u.payRate} currency={u.currency} className="text-xs" />}
              </div>
              <Link to={`${employeeBase}/${u.id}`} className="mt-2 block text-xs font-medium text-accent">View profile</Link>
            </div>
          ))}
        </div>
      </div>
    )
  }
}

function columns(base: string): Column<EmsUser>[] {
  return [
  {
    key: 'name',
    label: 'Employee',
    sortable: true,
    width: '220px',
    render: (row) => (
      <Link to={`${base}/${row.id}`} className="flex items-center gap-2">
        <Avatar name={row.name} src={row.avatarUrl} size="sm" />
        <div>
          <span className="font-medium text-foreground">{row.name}</span>
          <div className="text-xs text-muted-foreground">{row.email}</div>
        </div>
      </Link>
    ),
  },
  { key: 'employeeId', label: 'ID', sortable: true, render: (row) => <EmployeeIdBadge id={row.employeeId} /> },
  { key: 'role', label: 'Role', sortable: true, render: (row) => <RoleBadge role={row.role} size="sm" /> },
  { key: 'department', label: 'Department', sortable: true, render: (row) => <span className="text-sm">{row.department ?? '—'}</span> },
  { key: 'billable', label: 'Billable', sortable: true, align: 'center', render: (row) => <BillableChip billable={row.billable} size="sm" /> },
  { key: 'payRate', label: 'Pay Rate', sortable: true, align: 'right', render: (row) => <PayRateCell amount={row.payRate ?? 0} currency={row.currency} /> },
  { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant={row.status === 'active' ? 'success' : row.status === 'invited' ? 'warning' : 'default'} size="sm">{row.status}</Badge> },
  {
    key: 'createdAt',
    label: 'Started',
    sortable: true,
    render: (row) => <span className="ems-tabular text-xs">{row.createdAt ? formatDate(row.createdAt) : '—'}</span>,
  },
  ]
}

function applyFilters(
  users: EmsUser[],
  status: string,
  role: string,
  dept: string,
  search: string,
): EmsUser[] {
  const q = search.toLowerCase()
  return users.filter((u) => {
    if (status && u.status !== status) return false
    if (role && u.role !== role) return false
    if (dept && u.department !== dept) return false
    if (q && !(u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.employeeId.toLowerCase().includes(q))) return false
    return true
  })
}
