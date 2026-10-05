import { type ReactNode } from 'react'

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info'

export interface StatusRailItem {
  label: string
  value: ReactNode
  tone?: Tone
}

interface StatusRailProps {
  items: StatusRailItem[]
  className?: string
}

const toneClass: Record<Tone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  info: 'text-accent',
}

/** One-line live counters strip — the top altitude of the maximalist layout grammar (§4.3). */
export function StatusRail({ items, className = '' }: StatusRailProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs ${className}`}
    >
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex items-center gap-3">
          {index > 0 && <span className="h-3 w-px bg-border" aria-hidden="true" />}
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{item.label}</span>
            <span className={`ems-tabular font-semibold ${toneClass[item.tone ?? 'default']}`}>{item.value}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
