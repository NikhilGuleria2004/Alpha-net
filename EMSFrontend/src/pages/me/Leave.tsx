import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { DataTable } from '../../components/ems/DataTable'
import { FilterBar } from '../../components/ems/FilterBar'
import { EmsCard } from '../../components/ems/EmsCard'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Plus } from 'lucide-react'
import type { Column } from '../../components/ems/DataTable'
import type { LeaveRequest } from '../../types/hr'
import { formatDate } from '../../utils/date'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { getLeaveRequests } from '../../services/hrService'

const STATUS_COLORS: Record<LeaveRequest['status'], 'success' | 'warning' | 'danger' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'default',
}

export function MyLeavePage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const showLoading = useDelayedLoading(loading)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getLeaveRequests()
      .then((result) => {
        if (!cancelled) setRequests(result.requests)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load leave requests'))
          addToast('error', 'Could not load leave requests.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const myRequests = useMemo(() => user ? requests.filter((r) => r.userId === user.id) : requests, [requests, user])

  const filtered = useMemo(() => myRequests.filter((r) => {
    const q = search.toLowerCase()
    if (q && !(r.type.toLowerCase().includes(q) || r.status.toLowerCase().includes(q))) return false
    return true
  }), [myRequests, search])

  const upcoming = useMemo(() => filtered.filter((r) => r.status === 'pending' || r.status === 'approved'), [filtered])

  if (showLoading) {
    return (
      <EmsCard>
        <div className="py-12 text-center text-muted-foreground">Loading leave requests…</div>
      </EmsCard>
    )
  }

  if (error) {
    return (
      <EmsCard>
        <div className="py-12 text-center text-destructive">Failed to load leave requests</div>
      </EmsCard>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Leave</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.filter((r) => r.status === 'approved').length} approved · {filtered.filter((r) => r.status === 'pending').length} pending
          </p>
        </div>
        <Link to="/me/leave/new">
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />}>New Request</Button>
        </Link>
      </div>

      <EmsCard title="Upcoming" subtitle="Approved or pending leave in the next 30 days">
        {upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{r.type.replace('_', ' ')} — {formatDate(r.startDate)} to {formatDate(r.endDate)}</p>
                  <p className="text-xs text-muted-foreground">{r.days} days · {r.reason ?? 'No reason provided'}</p>
                </div>
                <Badge variant={STATUS_COLORS[r.status]} size="sm">{r.status}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No upcoming leave.</p>
        )}
      </EmsCard>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search requests…" />

      <DataTable columns={myLeaveColumns} data={filtered} pageSize={10} emptyTitle="No leave requests" emptyMessage="You don't have any leave requests yet." />
    </div>
  )
}

const myLeaveColumns: Column<LeaveRequest>[] = [
  { key: 'type', label: 'Type', render: (row) => <span className="capitalize">{row.type.replace('_', ' ')}</span> },
  { key: 'startDate', label: 'Start', render: (row) => <span className="ems-tabular text-xs">{formatDate(row.startDate)}</span> },
  { key: 'endDate', label: 'End', render: (row) => <span className="ems-tabular text-xs">{formatDate(row.endDate)}</span> },
  { key: 'days', label: 'Days', align: 'right', render: (row) => <span className="ems-tabular">{row.days}</span> },
  { key: 'status', label: 'Status', render: (row) => <Badge variant={STATUS_COLORS[row.status]} size="sm">{row.status}</Badge> },
  { key: 'submittedAt', label: 'Submitted', render: (row) => <span className="ems-tabular text-xs">{row.submittedAt ? formatDate(row.submittedAt) : '—'}</span> },
]
