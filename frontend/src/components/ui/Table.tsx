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
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>('asc')
  const [page, setPage] = useState(0)

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
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
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
      <table className="min-w-full divide-y divide-slate-200">
        <thead className={stickyHeader ? 'sticky top-0 bg-slate-50 z-10' : 'bg-slate-50'}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                onClick={() => col.sortable && handleSort(col.key)}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${alignClasses[col.align || 'left']} ${col.sortable ? 'cursor-pointer select-none hover:text-slate-700' : ''}`}
                style={col.width ? { width: col.width } : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && <span className="text-indigo-600">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </span>
              </th>
            ))}
            {rowActions && <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {paginatedData.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'cursor-pointer transition-colors hover:bg-slate-50' : 'transition-colors hover:bg-slate-50'}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-sm text-slate-700 ${alignClasses[col.align || 'left']}`}
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
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-slate-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-slate-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
