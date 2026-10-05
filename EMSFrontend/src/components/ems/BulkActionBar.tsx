import { useMemo, useState, type ReactNode } from 'react'
import { LayoutGrid, List, CalendarDays, Columns3 } from 'lucide-react'

export type BulkAction<T> = {
  id: string
  label: string
  icon?: ReactNode
  /** Guard — hidden/disabled when it returns a reason. */
  disabledReason?: (rows: T[]) => string | null
  run: (rows: T[]) => void | Promise<void>
}

interface BulkActionBarProps<T> {
  selected: T[]
  actions: BulkAction<T>[]
  onClear: () => void
  className?: string
}

const VIEW_ICONS = { list: List, grid: LayoutGrid, calendar: CalendarDays, board: Columns3 } as const

export type BulkView = keyof typeof VIEW_ICONS

/**
 * Selection action bar (EMSFrontend.md §8.2 + §7.5 bulk invite/resend/export):
 * appears when ≥1 row is selected, runs capability-checked actions over the
 * selection, then clears. Failed rows stay selected so the operator can retry.
 */
export function BulkActionBar<T>({ selected, actions, onClear, className = '' }: BulkActionBarProps<T>) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visible = useMemo(() => selected.filter(Boolean), [selected])
  if (visible.length === 0) return null

  const run = async (action: BulkAction<T>) => {
    setBusy(action.id)
    setError(null)
    try {
      await action.run(visible)
      onClear()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed — selection kept so you can retry.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 ${className}`}
      role="toolbar"
      aria-label={`${visible.length} rows selected`}
    >
      <span className="ems-tabular text-xs font-semibold text-accent" aria-live="polite">
        {visible.length} selected
      </span>
      {actions.map((action) => {
        const reason = action.disabledReason?.(visible) ?? null
        const running = busy === action.id
        return (
          <button
            key={action.id}
            type="button"
            disabled={reason !== null || busy !== null}
            title={reason ?? action.label}
            onClick={() => run(action)}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {action.icon}
            {running ? 'Working…' : action.label}
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => {
          setError(null)
          onClear()
        }}
        className="ml-auto min-h-[32px] rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Clear
      </button>
      {error && (
        <p className="w-full text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Segmented list/grid/board/calendar switch — visual half of `ViewSwitcher`-style view state. */
export function BulkViewSwitch({
  value,
  onChange,
  modes = ['list', 'grid'],
}: {
  value: BulkView
  onChange: (mode: BulkView) => void
  modes?: BulkView[]
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted p-0.5" role="radiogroup" aria-label="Change view">
      {modes.map((mode) => {
        const Icon = VIEW_ICONS[mode]
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${mode} view`}
            onClick={() => onChange(mode)}
            className={`inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
