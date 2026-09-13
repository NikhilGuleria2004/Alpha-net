import { useState } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Drawer } from '../../components/ui/Drawer'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { formatDate } from '../../utils/date'
import type { Timesheet } from '../../types/timesheet'
import type { Project } from '../../types/project'
import { DeclineModal } from './DeclineModal'

function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
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

// H4 + H5 (QA.md): only an admin or the supervisor of THIS timesheet's project
// may review, AND a user must not review their own submission (admins exempt).
// This mirrors backend access.ts canReviewTimesheet so the UI never shows
// Approve/Decline buttons that are about to 403.
function canReviewTimesheet(reviewerId: string | undefined, reviewerRole: string | undefined, reviewerIsSupervisor: boolean | undefined, timesheet: Timesheet, projects: Project[]): boolean {
  if (!reviewerId || !reviewerRole) return false
  if (reviewerRole === 'admin') return true
  if (reviewerRole !== 'user' || !reviewerIsSupervisor) return false
  // H5: a user must not review their own submission
  if (timesheet.userId === reviewerId) return false
  const project = projects.find((p) => p.id === timesheet.projectId)
  return project?.supervisorId === reviewerId
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

        const canReview = canReviewTimesheet(
    currentUser?.id,
    currentUser?.role,
    currentUser?.isSupervisor,
    timesheet,
    projects,
  )

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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve timesheet'
      addToast('error', message)
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to decline timesheet'
      addToast('error', message)
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
              <p className="text-sm font-medium text-muted-foreground">Employee</p>
              <p className="mt-1 text-sm text-foreground">{employee?.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Project</p>
              <p className="mt-1 text-sm text-foreground">{project?.name || '-'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Week</p>
              <p className="mt-1 text-sm text-foreground">
                {formatDate(start)} – {formatDate(end)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge status={timesheet.status} size="sm" />
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">Timesheet Entries</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work Item</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mon</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tue</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wed</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thu</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fri</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sat</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sun</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-card">
                  {timesheet.entries.map((entry) => {
                    const entryTotal = Object.values(entry.hours).reduce((sum, h) => sum + h, 0)
                    return (
                      <tr key={entry.id}>
                        <td className="px-4 py-2 text-sm text-foreground">{entry.description}</td>
                        {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => (
                          <td key={day} className="px-4 py-2 text-center text-sm text-foreground">{entry.hours[day].toFixed(1)}</td>
                        ))}
                        <td className="px-4 py-2 text-right text-sm font-medium text-foreground">{entryTotal.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-muted">
                  <tr>
                    <td colSpan={8} className="px-4 py-2 text-right text-sm font-semibold text-foreground">Total</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-foreground">{timesheet.totalHours.toFixed(1)}h</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Regular Hours</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{timesheet.regularHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Overtime</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{timesheet.overtimeHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Total Hours</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{timesheet.totalHours.toFixed(1)}h</p>
            </div>
          </div>

          {timesheet.notes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p className="mt-1 text-sm text-foreground">{timesheet.notes}</p>
            </div>
          )}

          {timesheet.status === 'pending' && canReview && (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
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
