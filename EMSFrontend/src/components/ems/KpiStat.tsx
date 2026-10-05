import { type ReactNode } from 'react'
import { StatDelta } from './StatDelta'

interface KpiStatProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  delta?: { value: number; label?: string; unit?: string; invert?: boolean }
  hint?: string
  sparkline?: ReactNode
  className?: string
}

/** Compact KPI tile — one of the units inside a {@link KpiStrip}. */
export function KpiStat({ label, value, icon, delta, hint, sparkline, className = '' }: KpiStatProps) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border border-border bg-card p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="ems-overline text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground" aria-hidden="true">{icon}</span>}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="ems-tabular text-xl font-semibold text-foreground">{value}</span>
        {sparkline && <span className="h-8 w-20 shrink-0">{sparkline}</span>}
      </div>
      {(delta || hint) && (
        <div className="flex items-center justify-between gap-2">
          {delta ? <StatDelta {...delta} /> : <span />}
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  )
}
