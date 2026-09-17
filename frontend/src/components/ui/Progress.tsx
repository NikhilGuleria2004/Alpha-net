import { type ReactNode } from 'react'

type ProgressVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface ProgressProps {
  value: number
  max?: number
  variant?: ProgressVariant
  label?: ReactNode
  showValue?: boolean
  className?: string
}

const variantClasses: Record<ProgressVariant, string> = {
  default: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-sky-600',
}

export function Progress({ value, max = 100, variant = 'default', label, showValue = false, className = '' }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={`w-full ${className}`}>
      {(label || showValue) && (
        <div className="mb-1 flex items-center justify-between">
          {label && <span className="text-sm font-medium text-foreground">{label}</span>}
          {showValue && <span className="text-sm text-muted-foreground">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${variantClasses[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
