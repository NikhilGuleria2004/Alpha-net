import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

const iconMap: Record<ToastType, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  error: <XCircle className="h-5 w-5 text-destructive" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning" />,
  info: <Info className="h-5 w-5 text-accent" />,
}

const bgMap: Record<ToastType, string> = {
  success: 'bg-success-soft border-success/20',
  error: 'bg-error-soft border-destructive/20',
  warning: 'bg-warning-soft border-warning/20',
  info: 'bg-accent-soft border-accent/20',
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] shadow-xl transition-all ${bgMap[toast.type]}`}
          role="alert"
        >
          <div className="shrink-0">{iconMap[toast.type]}</div>
          <p className="flex-1 text-sm text-foreground">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-muted-foreground"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
