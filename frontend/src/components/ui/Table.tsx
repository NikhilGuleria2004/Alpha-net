import { type ReactNode, useState } from 'react'

type SortDirection = 'asc' | 'desc'

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  render?: (row: T) => ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
  emptyState?: ReactNode
  loadingState?: ReactNode
  rowActions?: (row: T) => ReactNode
  stickyHeader?: boolean
  pageSize?: number
  /** Guideline 1.11 (checklist item 1.4): lift sort/pagination into the URL by
   * passing [value, setter] pairs (e.g. derived from useQueryParamState). When
   * omitted, the table manages its own state as before. */
  sortState?: readonly [string | null, (key: string | null) => void]
  sortDirState?: readonly [SortDirection, (dir: SortDirection) => void]
  pageState?: readonly [number, (page: number) => void]
}

export function Table<T>({
  columns,
  data,
  onRowClick,
  emptyState,
  loadingState,
  rowActions,
  stickyHeader = false,
  pageSize,
  sortState,
  sortDirState,
  pageState,
}: TableProps<T>) {
  const [internalSortKey, setInternalSortKey] = useState<string | null>(null)
  const [internalSortDir, setInternalSortDir] = useState<SortDirection>('asc')
  const [internalPage, setInternalPage] = useState(0)

  const sortKey = sortState ? sortState[0] : internalSortKey
  const setSortKey: (key: string | null) => void = sortState ? sortState[1] : setInternalSortKey
  const sortDir: SortDirection = (sortDirState ? sortDirState[0] : internalSortDir) === 'desc' ? 'desc' : 'asc'
  const setSortDir: (dir: SortDirection) => void = sortDirState ? sortDirState[1] : setInternalSortDir
  const page = pageState ? pageState[0] : internalPage
  const setPage: (page: number) => void = pageState ? pageState[1] : setInternalPage

  const sortedData = (() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey]
      const bVal = (b as Record<string, unknown>)[sortKey]
      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      const comparison = aVal < bVal ? -1 : 1
      return sortDir === 'asc' ? comparison : -comparison
    })
  })()

  const paginatedData = pageSize ? sortedData.slice(page * pageSize, (page + 1) * pageSize) : sortedData
  const totalPages = pageSize ? Math.max(1, Math.ceil(sortedData.length / pageSize)) : 1

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const alignClasses: Record<string, string> = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
  }

  if (loadingState) {
    return <div className="w-full">{loadingState}</div>
  }

  if (!data.length && emptyState) {
    return <div className="w-full">{emptyState}</div>
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full divide-y divide-border">
        <thead className={stickyHeader ? 'sticky top-0 bg-muted z-10' : 'bg-muted'}>
          <tr>
            {columns.map((col) => {
              const isSorted = sortKey === col.key
              const ariaSortValue: 'ascending' | 'descending' | 'none' | undefined = col.sortable
                ? isSorted
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                : undefined
              return (
              <th
                key={col.key}
                scope="col"
                aria-sort={ariaSortValue}
                className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${alignClasses[col.align || 'left']}`}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    aria-label={`Sort by ${col.label}${isSorted ? (sortDir === 'asc' ? ', sorted ascending' : ', sorted descending') : ''}`}
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span>{col.label}</span>
                    {sortKey === col.key && (
                      <span className="text-accent" aria-hidden="true">
                        {sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                ) : (
                  col.label
                )}
              </th>
              )
            })}
            {rowActions && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {paginatedData.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(row)}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              className={onRowClick ? 'cursor-pointer transition-colors hover:bg-muted' : 'transition-colors hover:bg-muted'}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-sm text-foreground ${alignClasses[col.align || 'left']}`}
                >
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
              {rowActions && (
                <td className="px-4 py-3 text-right text-sm" onClick={(e) => e.stopPropagation()}>
                  {rowActions(row)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {pageSize && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded-full border border-border bg-card px-3 py-1 text-[13px] disabled:opacity-50 hover:bg-muted"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-full border border-border bg-card px-3 py-1 text-[13px] disabled:opacity-50 hover:bg-muted"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
