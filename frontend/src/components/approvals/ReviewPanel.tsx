import { useState } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Drawer } from '../../components/ui/Drawer'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { formatDate } from '../../utils/date'
import type { Timesheet } from '../../types/timesheet'
import type { User } from '../../types/auth'
import type { Project } from '../../types/project'
import { DeclineModal } from './DeclineModal'

function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel || 'Confirm'}</Button>
        </div>
      </div>
    </div>
  )
}

interface ReviewPanelProps {
  isOpen: boolean
  onClose: () => void
  timesheet: Timesheet
}

function canReviewTimesheet(reviewerId: string | undefined, reviewerRole: string | undefined, reviewerIsSupervisor: boolean | undefined, timesheet: Timesheet, users: User[], projects: Project[]): boolean {
  if (!reviewerId || !reviewerRole) return false
  if (reviewerRole === 'admin') return true
  if (reviewerRole === 'user' && reviewerIsSupervisor) {
    const project = projects.find((p) => p.id === timesheet.projectId)
    if (project?.supervisorId === reviewerId) return true
    const user = users.find((u) => u.id === timesheet.userId)
    if (user?.supervisorId === reviewerId) return true
    if (project?.teamMemberIds.includes(reviewerId)) return true
    return false
  }
  return false
}

export function ReviewPanel({ isOpen, onClose, timesheet }: ReviewPanelProps) {
  const { users, projects, approveTimesheet, declineTimesheet, refreshTimesheets } = useAppData()
  const { user: currentUser } = useAuth()
  const { addToast } = useToast()
  const [isApproveOpen, setIsApproveOpen] = useState(false)
  const [isDeclineOpen, setIsDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  if (!timesheet || !timesheet.userId) {
    return null
  }

  const employee = users.find((u) => u.id === timesheet.userId)
  const project = projects.find((p) => p.id === timesheet.projectId)
  const start = new Date(timesheet.weekStart)
  const end = new Date(start)
  end.setDate(end.getDate() + 4)

  const canReview = canReviewTimesheet(currentUser?.id, currentUser?.role, currentUser?.isSupervisor, timesheet, users, projects)

  const handleApprove = async () => {
    setIsProcessing(true)
    try {
      const updated = await approveTimesheet(timesheet.id)
      if (updated) {
        await refreshTimesheets()
        // Approval/decline notifications + activities are created server-side by
        // approval.service.ts — the client duplicated them via POST
        // /notifications + POST /activities (S2/S3 forgery holes + D1 duplicate
        // logs attributed to a hardcoded 'admin-1' fallback). Removed.
        addToast('success', 'Timesheet approved')
        setIsApproveOpen(false)
        onClose()
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDecline = async () => {
    if (!declineReason.trim()) return
    setIsProcessing(true)
    try {
      const updated = await declineTimesheet(timesheet.id, declineReason.trim())
      if (updated) {
        await refreshTimesheets()
        addToast('success', 'Timesheet declined')
        setDeclineReason('')
        setIsDeclineOpen(false)
        onClose()
      }
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={`Review Timesheet`} size="lg">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-slate-500">Employee</p>
              <p className="mt-1 text-sm text-slate-900">{employee?.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Project</p>
              <p className="mt-1 text-sm text-slate-900">{project?.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Week</p>
              <p className="mt-1 text-sm text-slate-900">
                {formatDate(start)} – {formatDate(end)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Status</p>
              <div className="mt-1">
                <StatusBadge status={timesheet.status} size="sm" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-500 mb-3">Timesheet Entries</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Work Item</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Mon</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Tue</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Wed</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Thu</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Fri</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Sat</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Sun</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {timesheet.entries.map((entry) => {
                    const entryTotal = Object.values(entry.hours).reduce((sum, h) => sum + h, 0)
                    return (
                      <tr key={entry.id}>
                        <td className="px-4 py-2 text-sm text-slate-900">{entry.description}</td>
                        {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => (
                          <td key={day} className="px-4 py-2 text-center text-sm text-slate-700">{entry.hours[day].toFixed(1)}</td>
                        ))}
                        <td className="px-4 py-2 text-right text-sm font-medium text-slate-900">{entryTotal.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={8} className="px-4 py-2 text-right text-sm font-semibold text-slate-900">Total</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-slate-900">{timesheet.totalHours.toFixed(1)}h</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Regular Hours</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{timesheet.regularHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Overtime</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{timesheet.overtimeHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Total Hours</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{timesheet.totalHours.toFixed(1)}h</p>
            </div>
          </div>

          {timesheet.notes && (
            <div>
              <p className="text-sm font-medium text-slate-500">Notes</p>
              <p className="mt-1 text-sm text-slate-700">{timesheet.notes}</p>
            </div>
          )}

          {timesheet.status === 'pending' && canReview && (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
              <Button variant="secondary" onClick={() => setIsDeclineOpen(true)} disabled={isProcessing}>Decline</Button>
              <Button onClick={() => setIsApproveOpen(true)} disabled={isProcessing}>Approve</Button>
            </div>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        isOpen={isApproveOpen}
        onClose={() => setIsApproveOpen(false)}
        onConfirm={handleApprove}
        title="Approve Timesheet?"
        description={`Are you sure you want to approve this timesheet for ${employee?.name || 'the employee'}?`}
        confirmLabel="Approve"
      />

      <DeclineModal
        isOpen={isDeclineOpen}
        onClose={() => { setDeclineReason(''); setIsDeclineOpen(false) }}
        onConfirm={handleDecline}
        reason={declineReason}
        onReasonChange={setDeclineReason}
      />
    </>
  )
}
