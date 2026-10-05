import { LayoutList, KanbanSquare, CalendarDays } from 'lucide-react'

export type EmsViewMode = 'list' | 'board' | 'calendar' | 'grid'

interface ViewSwitcherProps {
  value: EmsViewMode
  onChange: (mode: EmsViewMode) => void
  modes?: EmsViewMode[]
  ariaLabel?: string
  className?: string
}

const MODE_META: Record<EmsViewMode, { label: string; icon: typeof LayoutList }> = {
  list: { label: 'List', icon: LayoutList },
  board: { label: 'Board', icon: KanbanSquare },
  calendar: { label: 'Calendar', icon: CalendarDays },
  grid: { label: 'Grid', icon: LayoutList },
}

/**
 * List/board/calendar toggle persisted in the URL (EMSFrontend.md §8.2).
 * The page owns persistence via `useQueryParamState('view')`; this is the
 * dumb, keyboard-operable segmented control (`role="radiogroup"`).
 */
export function ViewSwitcher({ value, onChange, modes = ['list', 'board'], ariaLabel = 'Change view', className = '' }: ViewSwitcherProps) {
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5 ${className}`} role="radiogroup" aria-label={ariaLabel}>
      {modes.map((mode) => {
        const meta = MODE_META[mode]
        const Icon = meta.icon
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}
