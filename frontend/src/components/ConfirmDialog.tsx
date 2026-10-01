import { type ReactNode, useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

type ConfirmVariant = 'default' | 'danger'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape cancels, Tab is trapped, focus enters on the first control and
  // returns to the trigger on close (Interactions — "manage focus").
  useFocusTrap(open, dialogRef, { onClose: onCancel, initialFocus: 'first' })

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="rounded-xl border border-border bg-card p-6 shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-2 text-foreground">{title}</h3>
        <p className="text-muted-foreground mb-4 text-sm">{message}</p>
        {children}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            // Guards double submits while the action is in flight, so the three
            // hand-rolled dialogs this component replaced lose nothing.
            disabled={isLoading}
            className={`rounded-lg px-4 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-destructive hover:bg-destructive/90 focus-visible:ring-destructive'
                : 'bg-accent hover:bg-accent-hover focus-visible:ring-accent'
            }`}
          >
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}