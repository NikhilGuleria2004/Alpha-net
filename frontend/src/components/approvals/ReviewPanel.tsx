import { useState } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Drawer } from '../../components/ui/Drawer'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { formatWeekRange } from '../../utils/date'
import type { Timesheet } from '../../types/timesheet'
import type { Project } from '../../types/project'
import { DeclineModal } from './DeclineModal'
import { ConfirmDialog } from '../ConfirmDialog'
import { formatHours } from '../../utils/format'
import { failureMessage } from '../../utils/errorMessage'

// F-03: this file used to carry its own ConfirmDialog copy (a bare
// role="dialog" div with no accessible name and no focus trap). It now uses the
// shared component, which names the dialog, traps Tab, closes on Escape and
// returns focus to the trigger.

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
      const message = failureMessage(err, { what: 'approve that timesheet', reassurance: 'It is still pending', next: 'reload the page and try again' })
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
      const message = failureMessage(err, { what: 'decline that timesheet', reassurance: 'It is still pending and unchanged', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={`Review Timesheet`} size="lg" resizable defaultWidth={640}>
        <div className="space-y-6 pb-20">
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
                {formatWeekRange(timesheet.weekStart)}
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
              <table className="min-w-full divide-y divide-border">
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
                <tbody className="divide-y divide-border bg-card">
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
                    <td className="px-4 py-2 text-right text-sm font-semibold text-foreground">{formatHours(timesheet.totalHours)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Regular Hours</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatHours(timesheet.regularHours)}</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Overtime</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatHours(timesheet.overtimeHours)}</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Total Hours</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{formatHours(timesheet.totalHours)}</p>
            </div>
          </div>

          {timesheet.notes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p className="mt-1 text-sm text-foreground">{timesheet.notes}</p>
            </div>
          )}

          {timesheet.status === 'pending' && canReview && (
            <div className="absolute bottom-0 left-0 right-0 px-6 py-4 bg-card border-t border-border">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button variant="secondary" onClick={() => setIsDeclineOpen(true)} disabled={isProcessing}>Decline</Button>
                <Button onClick={() => setIsApproveOpen(true)} disabled={isProcessing}>Approve</Button>
              </div>
            </div>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={isApproveOpen}
        onCancel={() => setIsApproveOpen(false)}
        onConfirm={handleApprove}
        title="Approve Timesheet?"
        message={`Are you sure you want to approve this timesheet for ${employee?.name || 'the employee'}?`}
        confirmLabel="Approve"
        variant="danger"
        isLoading={isProcessing}
      />

      <DeclineModal
        isOpen={isDeclineOpen}
        onClose={() => { setDeclineReason(''); setIsDeclineOpen(false) }}
        onConfirm={handleDecline}
        reason={declineReason}
        onReasonChange={setDeclineReason}
        loading={isProcessing}
      />
    </>
  )
}
