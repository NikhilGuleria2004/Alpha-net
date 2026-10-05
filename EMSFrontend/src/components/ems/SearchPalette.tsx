import { useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'
import { Skeleton } from '../ui/Skeleton'

export interface SearchPaletteResult<T> {
  id: string
  title: string
  subtitle?: string
  meta?: string
  item: T
}

interface SearchPaletteProps<T> {
  query: string
  onQueryChange: (query: string) => void
  results: SearchPaletteResult<T>[]
  onSelect: (item: T) => void
  loading?: boolean
  placeholder?: string
  emptyIcon?: ReactNode
  emptyTitle?: string
  emptyMessage?: string
  ariaLabel?: string
}

/**
 * Employee / resource search dropdown primitive (EMSFrontend.md §8.2): the
 * combobox behind the onboarding manager picker and the assignment board's
 * resource search. Arrow-key navigable, announces selection via a live region.
 */
export function SearchPalette<T>({
  query,
  onQueryChange,
  results,
  onSelect,
  loading = false,
  placeholder = 'Search…',
  emptyIcon = <Search className="h-5 w-5" />,
  emptyTitle = 'No matches',
  emptyMessage = 'Try a different name, ID, or skill.',
  ariaLabel = 'Search',
}: SearchPaletteProps<T>) {
  const [active, setActive] = useState(0)
  const listId = `ems-search-${ariaLabel.toLowerCase().replace(/\s+/g, '-')}`

  const choose = (result: SearchPaletteResult<T>) => {
    onSelect(result.item)
  }

  return (
    <div className="w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={results[active] ? `ems-search-option-${results[active].id}` : undefined}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (results.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => (a + 1) % results.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => (a - 1 + results.length) % results.length)
            } else if (e.key === 'Enter') {
              const hit = results[active]
              if (hit) {
                e.preventDefault()
                choose(hit)
              }
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>
      <div aria-live="polite" className="sr-only">
        {loading ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}
      </div>
      {loading ? (
        <div className="mt-1 rounded-lg border border-border bg-card p-2" role="status" aria-label="Searching">
          <Skeleton className="mb-1 h-9 w-full" />
          <Skeleton className="mb-1 h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
          <span className="sr-only">Searching…</span>
        </div>
      ) : query.trim() !== '' && results.length === 0 ? (
        <div className="mt-1 rounded-lg border border-border bg-card">
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyMessage} />
        </div>
      ) : results.length > 0 ? (
        <ul id={listId} role="listbox" aria-label={ariaLabel} className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {results.map((result, index) => (
            <li key={result.id} id={`ems-search-option-${result.id}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${index === active ? 'bg-muted' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{result.title}</span>
                  {result.subtitle && <span className="block truncate text-xs text-muted-foreground">{result.subtitle}</span>}
                </span>
                {result.meta && <span className="ems-tabular shrink-0 text-xs text-muted-foreground">{result.meta}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
