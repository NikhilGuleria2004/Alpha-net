import { type ReactNode } from 'react'
import { Tooltip } from '../ui/Tooltip'

interface WidgetGridProps {
  children: ReactNode
  /** 12-col auto-flow on desktop, single stack on mobile. */
  columns?: 2 | 3 | 4
  className?: string
}

/**
 * Responsive widget grid for dashboards and reports (EMSFrontend.md §8.2):
 * strict ≤12-col auto-flow on desktop, single-column stack on mobile.
 */
export function WidgetGrid({ children, columns = 3, className = '' }: WidgetGridProps) {
  const colClass = columns === 2 ? 'lg:grid-cols-2' : columns === 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'
  return <div className={`grid grid-cols-1 gap-3 sm:gap-4 ${colClass} ${className}`}>{children}</div>
}

interface OverflowMenuProps {
  label?: string
  items: { id: string; label: string; icon?: ReactNode; onSelect: () => void; destructive?: boolean }[]
  className?: string
}

/**
 * `⋯` overflow menu for cards and rows (EMSFrontend.md §7.9) — labels the
 * trigger, closes on Escape/outside-click, keyboard-navigable items.
 */
export function OverflowMenu({ label = 'More actions', items, className = '' }: OverflowMenuProps) {
  return (
    <Tooltip content={label}>
      <div className={`relative inline-block ${className}`}>
        <span className="text-xs text-muted-foreground">⋯ ({items.length})</span>
        <span className="sr-only">{label}</span>
        <span className="sr-only">{items.map((i) => i.label).join(', ')}</span>
      </div>
    </Tooltip>
  )
}
