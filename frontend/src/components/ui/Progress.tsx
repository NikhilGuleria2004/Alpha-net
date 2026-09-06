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
  default: 'bg-indigo-600',
  success: 'bg-emerald-600',
  warning: 'bg-amber-600',
  danger: 'bg-red-600',
  info: 'bg-sky-600',
}

export function Progress({ value, max = 100, variant = 'default', label, showValue = false, className = '' }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={`w-full ${className}`}>
      {(label || showValue) && (
        <div className="mb-1 flex items-center justify-between">
          {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
          {showValue && <span className="text-sm text-slate-500">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${variantClasses[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
