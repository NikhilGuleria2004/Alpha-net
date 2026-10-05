import { type ReactNode } from 'react'
import { Search, X } from 'lucide-react'

export interface FilterChip {
  id: string
  label: string
  active: boolean
  onToggle: () => void
}

interface FilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  chips?: FilterChip[]
  onClearAll?: () => void
  actions?: ReactNode
  savedViews?: ReactNode
  className?: string
}

/**
 * Composable filter chips + search + saved views (EMSFrontend.md §8.2).
 * Search text and chip state live in the URL at the page level
 * (`useQueryParamState`); the bar itself is presentational, with a live
 * result count slot via `actions`.
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  chips = [],
  onClearAll,
  actions,
  savedViews,
  className = '',
}: FilterBarProps) {
  const hasActive = chips.some((c) => c.active) || searchValue !== ''
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        {savedViews}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
      {(chips.length > 0 || hasActive) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filters">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onToggle}
              aria-pressed={chip.active}
              className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                chip.active
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {chip.label}
            </button>
          ))}
          {hasActive && onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
