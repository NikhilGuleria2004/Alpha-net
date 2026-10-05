import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { DataTable } from '../../components/ems/DataTable'
import { FilterBar } from '../../components/ems/FilterBar'
import { EmsCard } from '../../components/ems/EmsCard'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Select'
import { Plus } from 'lucide-react'
import type { Column } from '../../components/ems/DataTable'
import { getLeaveRequests, getLeaveTypes } from '../../services/hrService'
import { useToast } from '../../contexts/ToastContext'
import type { LeaveRequest } from '../../types/hr'
import { formatDate } from '../../utils/date'

export function HrLeaveList() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { addToast } = useToast()
  const [data, setData] = useState<{ requests: LeaveRequest[]; total: number } | null>(null)
  const [leaveTypes, setLeaveTypes] = useState<{ value: LeaveRequest['type']; label: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getLeaveRequests(), getLeaveTypes()])
      .then(([requests, types]) => {
        if (cancelled) return
        setData(requests)
        setLeaveTypes(types.types)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load leave requests'
        setError(message)
        addToast('error', message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const requests = data?.requests ?? []
  const filtered = requests.filter((r) => {
    const q = search.toLowerCase()
    if (q && !(r.employeeName.toLowerCase().includes(q) || r.type.toLowerCase().includes(q))) return false
    if (typeFilter && r.type !== typeFilter) return false
    if (statusFilter && r.status !== statusFilter) return false
    return true
  })

  if (error) {
    return <EmsCard title="Leave Requests" subtitle={error}>{null}</EmsCard>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Leave Requests</h1>
        <Link to="/hr/leave/new">
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />}>New Request</Button>
        </Link>
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search requests…"
        chips={[
          { id: 'type', label: 'Type Filter', active: !!typeFilter, onToggle: () => setTypeFilter(typeFilter ? '' : 'vacation') },
          { id: 'status', label: 'Pending Only', active: !!statusFilter, onToggle: () => setStatusFilter(statusFilter ? '' : 'pending') },
        ]}
        onClearAll={() => { setSearch(''); setTypeFilter(''); setStatusFilter('') }}
        actions={
          <Select
            value={typeFilter}
            options={[{ value: '', label: 'All Types' }, ...leaveTypes]}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by type"
          />
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        pageSize={15}
        loading={loading}
        emptyTitle="No leave requests"
        emptyMessage="Requests matching your filters will appear here."
      />
    </div>
  )
}

const columns: Column<LeaveRequest>[] = [
  { key: 'employeeName', label: 'Employee', sortable: true, render: (row) => <span className="font-medium">{row.employeeName}</span> },
  { key: 'type', label: 'Type', sortable: true, render: (row) => <span className="capitalize">{row.type}</span> },
  { key: 'startDate', label: 'Start', sortable: true, render: (row) => <span className="ems-tabular text-xs">{formatDate(row.startDate)}</span> },
  { key: 'endDate', label: 'End', sortable: true, render: (row) => <span className="ems-tabular text-xs">{formatDate(row.endDate)}</span> },
  { key: 'days', label: 'Days', align: 'right', render: (row) => <span className="ems-tabular">{row.days}</span> },
  { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'} size="sm">{row.status}</Badge> },
  { key: 'submittedAt', label: 'Submitted', sortable: true, render: (row) => <span className="ems-tabular text-xs">{row.submittedAt ? formatDate(row.submittedAt) : '—'}</span> },
]
