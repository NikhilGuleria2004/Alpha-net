import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { DataTable } from '../../components/ems/DataTable'
import { FilterBar } from '../../components/ems/FilterBar'
import { EmsCard } from '../../components/ems/EmsCard'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { Plus } from 'lucide-react'
import type { Column } from '../../components/ems/DataTable'
import { getLeaveRequests, getLeaveTypes, updateLeaveStatus } from '../../services/hrService'
import { useToast } from '../../contexts/ToastContext'
import { Modal } from '../../components/ui/Modal'
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

  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

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

  const handleQuickAction = useCallback(async (requestId: string, status: LeaveRequest['status']) => {
    setActionLoading(requestId)
    try {
      await updateLeaveStatus(requestId, status)
      addToast('success', `Leave request ${status}`)
      setData((prev) => prev ? { ...prev, requests: prev.requests.map((r) => r.id === requestId ? { ...r, status } : r) } : null)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : `Failed to ${status} request`)
    } finally {
      setActionLoading(null)
    }
  }, [addToast, setData, setActionLoading])

  const handleModalAction = async (status: LeaveRequest['status']) => {
    if (!selectedRequest) return
    setActionLoading(selectedRequest.id)
    try {
      await updateLeaveStatus(selectedRequest.id, status)
      addToast('success', `Leave request ${status}`)
      setData((prev) => prev ? { ...prev, requests: prev.requests.map((r) => r.id === selectedRequest.id ? { ...r, status, reviewedBy: 'You', reviewedAt: new Date().toISOString() } : r) } : null)
      setModalOpen(false)
      setSelectedRequest(null)
      setDeclineReason('')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : `Failed to ${status} request`)
    } finally {
      setActionLoading(null)
    }
  }

  const openModal = (request: LeaveRequest) => {
    setSelectedRequest(request)
    setModalOpen(true)
    setDeclineReason('')
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelectedRequest(null)
    setDeclineReason('')
  }

  const columns = useMemo<Column<LeaveRequest>[]>(() => [
  { key: 'employeeName', label: 'Employee', sortable: true, render: (row) => <span className="font-medium">{row.employeeName}</span> },
  { key: 'type', label: 'Type', sortable: true, render: (row) => <span className="capitalize">{row.type}</span> },
  { key: 'startDate', label: 'Start', sortable: true, render: (row) => <span className="ems-tabular text-xs">{formatDate(row.startDate)}</span> },
  { key: 'endDate', label: 'End', sortable: true, render: (row) => <span className="ems-tabular text-xs">{formatDate(row.endDate)}</span> },
  { key: 'days', label: 'Days', align: 'right', render: (row) => <span className="ems-tabular">{row.days}</span> },
  {
    key: 'status',
    label: 'Status',
    sortable: true,
    render: (row) => {
      const badgeVariant = row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'
      if (row.status === 'pending') {
        return (
          <div className="flex items-center gap-1">
            <Badge variant={badgeVariant} size="sm">{row.status}</Badge>
            <Button
              variant="success"
              size="icon"
              aria-label="Approve"
              title="Approve"
              onClick={(e) => {
                e.stopPropagation()
                handleQuickAction(row.id, 'approved')
              }}
            >
              A
            </Button>
            <Button
              variant="danger"
              size="icon"
              aria-label="Decline"
              title="Decline"
              onClick={(e) => {
                e.stopPropagation()
                handleQuickAction(row.id, 'rejected')
              }}
            >
              D
            </Button>
          </div>
        )
      }
      return <Badge variant={badgeVariant} size="sm">{row.status}</Badge>
    },
  },
  { key: 'submittedAt', label: 'Submitted', sortable: true, render: (row) => <span className="ems-tabular text-xs">{row.submittedAt ? formatDate(row.submittedAt) : '—'}</span> },
], [handleQuickAction])

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
        getRowId={(row) => row.id}
        onRowClick={openModal}
      />

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={selectedRequest ? `Leave Request · ${selectedRequest.employeeName}` : 'Leave Request'}
        size="lg"
        footer={
          selectedRequest && selectedRequest.status === 'pending' && (
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={closeModal}
                disabled={!!actionLoading}
              >
                Close
              </Button>
              <Button
                variant="danger"
                onClick={() => handleModalAction('rejected')}
                disabled={!!actionLoading || !declineReason.trim()}
              >
                {actionLoading === selectedRequest.id ? 'Declining…' : 'Decline'}
              </Button>
              <Button
                variant="success"
                onClick={() => handleModalAction('approved')}
                disabled={!!actionLoading}
              >
                {actionLoading === selectedRequest.id ? 'Approving…' : 'Approve'}
              </Button>
            </div>
          )
        }
      >
        {selectedRequest && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-foreground">Employee</p>
                <p className="text-muted-foreground">{selectedRequest.employeeName}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Type</p>
                <p className="capitalize text-muted-foreground">{selectedRequest.type.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Start Date</p>
                <p className="text-muted-foreground">{formatDate(selectedRequest.startDate)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">End Date</p>
                <p className="text-muted-foreground">{formatDate(selectedRequest.endDate)}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-foreground">Duration</p>
                <p className="text-muted-foreground">{selectedRequest.days} day{selectedRequest.days !== 1 ? 's' : ''}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-foreground">Reason</p>
                <p className="text-muted-foreground">{selectedRequest.reason ?? 'No reason provided'}</p>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground mb-2">Status</p>
              <div className="flex items-center gap-3">
                <Badge variant={selectedRequest.status === 'approved' ? 'success' : selectedRequest.status === 'rejected' ? 'danger' : 'warning'} size="md">
                  {selectedRequest.status}
                </Badge>
                {selectedRequest.reviewedBy && (
                  <span className="text-xs text-muted-foreground">
                    {selectedRequest.status !== 'pending' ? 'Reviewed by ' : 'Submitted by '}
                    {selectedRequest.reviewedBy}
                    {selectedRequest.reviewedAt && ` · ${formatDate(selectedRequest.reviewedAt)}`}
                  </span>
                )}
              </div>
            </div>

            {selectedRequest.status === 'rejected' && selectedRequest.note && (
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground mb-2">Decline Reason</p>
                <p className="text-muted-foreground bg-muted p-3 rounded-md">{selectedRequest.note}</p>
              </div>
            )}

            {selectedRequest.status === 'pending' && (
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground mb-2">Decline Reason (required if declining)</p>
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Enter reason for declining…"
                  rows={3}
                  aria-required="true"
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}