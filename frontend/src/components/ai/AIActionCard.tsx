import type { AIPendingAction } from '../../types/ai'
import { useAIChat } from '../../contexts/AIContext'
import { Check, X, Pencil, Clock, AlertTriangle } from 'lucide-react'

interface AIActionCardProps {
  messageId: string
  action: AIPendingAction
}

export function AIActionCard({ messageId, action }: AIActionCardProps) {
  const { approveAction, cancelAction, editAction, actionBusyId, actionError } = useAIChat()
  const busy = actionBusyId === action.id

  const isReview = action.tool !== 'createTimesheet'
  const isDecline = action.tool === 'declineTimesheet'

  const copy = isDecline
    ? {
        heading: 'Decline requires your approval — not saved yet',
        confirm: 'Confirm Decline',
        confirmClass: 'bg-destructive hover:bg-destructive',
        seed: 'Please revise this decline:\n',
        changes: '\n\nDifferent reason: ',
      }
    : isReview
      ? {
          heading: 'Approval requires your confirmation — not saved yet',
          confirm: 'Confirm Approval',
          confirmClass: 'bg-success hover:bg-success',
          seed: 'Please change this approval:\n',
          changes: '\n\nWhat I want instead: ',
        }
      : {
          heading: 'Action requires approval — not saved yet',
          confirm: 'Approve & Save',
          confirmClass: 'bg-accent hover:bg-accent-hover',
          seed: 'Please revise this draft timesheet:\n',
          changes: '\n\nChanges needed: ',
        }

  const handleEdit = () => {
    const summary = editAction(messageId)
    if (summary) {
      const input = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement | null
      if (input) {
        input.value = `${copy.seed}${summary}${copy.changes}`
        input.focus()
      }
    }
  }

  return (
    <div className="mb-3 flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md border-2 border-accent/30 bg-accent-soft px-4 py-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wide text-accent-hover">
            {copy.heading}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{action.summary}</p>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Expires in ~{Math.max(1, Math.round(action.expiresInSeconds / 60))} min
        </p>
        {actionError && (
          <p className="mt-2 text-xs font-medium text-destructive">{actionError}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => approveAction(messageId)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-50 ${copy.confirmClass}`}
          >
            <Check className="h-4 w-4" />
            {busy ? 'Working…' : copy.confirm}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cancelAction(messageId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-white px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-error-soft disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}