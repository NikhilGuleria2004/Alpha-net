import { type ReactNode } from 'react'

export interface TimelineItem {
  id: string
  title: string
  description?: string
  /** ISO timestamp — rendered in the rail gutter. */
  timestamp: string
  actor?: string
  icon?: ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

interface TimelineRailProps {
  items: TimelineItem[]
  className?: string
}

const toneDot: Record<NonNullable<TimelineItem['tone']>, string> = {
  default: 'bg-muted-foreground/50',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-accent',
}

/**
 * Vertical audit/activity timeline (EMSFrontend.md §8.2): pay-rate history,
 * employee activity tabs, dashboard "latest" widgets. The dot colour is
 * decorative — the title text always carries the meaning.
 */
export function TimelineRail({ items, className = '' }: TimelineRailProps) {
  return (
    <ol className={`flex flex-col ${className}`} aria-label="Activity timeline">
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < items.length - 1 && (
            <span className="absolute left-[7px] top-5 h-[calc(100%-1.25rem)] w-px bg-border" aria-hidden="true" />
          )}
          <span
            className={`mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full ${toneDot[item.tone ?? 'default']}`}
            aria-hidden="true"
          >
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            {item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}
            <p className="ems-tabular mt-1 text-[11px] text-muted-foreground">
              {item.timestamp}
              {item.actor && ` · ${item.actor}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
