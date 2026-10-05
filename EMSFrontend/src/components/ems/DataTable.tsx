import { useMemo, useState, type ReactNode } from 'react'
import { Settings2 } from 'lucide-react'
import { Table, type Column } from '../ui/Table'
import { Checkbox } from '../ui/Checkbox'
import { EmptyState } from '../ui/EmptyState'
import { Button } from '../ui/Button'

export type { Column }

export interface DataTableColumn<T> extends Column<T> {
  /** Stable id used for column visibility toggling. Defaults to `key`. */
  id?: string
  /** When false the column starts hidden (user can re-enable). */
  defaultVisible?: boolean
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** Unique id per row — required when `selectable` is on. */
  getRowId?: (row: T, index: number) => string
  selectable?: boolean
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  onRowClick?: (row: T) => void
  rowActions?: (row: T) => ReactNode
  stickyHeader?: boolean
  pageSize?: number
  loading?: boolean
  loadingRows?: number
  emptyTitle?: string
  emptyMessage?: string
  emptyAction?: ReactNode
  columnToggle?: boolean
  ariaLabel?: string
}

type WrappedRow<T> = { __row: T; __id: string }

/**
 * Dense, selectable, column-configurable table (EMSFrontend.md §8.2).
 *
 * Wraps the ported `Table` (which owns sort + pagination) and adds the EMS
 * density layer on top: 32px row floor, tabular numerics, sticky header, row
 * selection with a header checkbox, and an optional column-visibility toggle.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    data,
    getRowId,
    selectable = false,
    selectedIds,
    onSelectionChange,
    onRowClick,
    rowActions,
    stickyHeader = true,
    pageSize = 15,
    loading = false,
    loadingRows = 8,
    emptyTitle = 'No records found',
    emptyMessage = 'Try adjusting your filters, or create a new record.',
    emptyAction,
    columnToggle = false,
    ariaLabel = 'Records',
  } = props

  const [hidden, setHidden] = useState<string[]>(() =>
    columns.filter((c) => c.defaultVisible === false).map((c) => c.id ?? c.key),
  )
  const [showToggle, setShowToggle] = useState(false)

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.includes(c.id ?? c.key)),
    [columns, hidden],
  )

  const ids = useMemo(
    () => data.map((row, i) => getRowId?.(row, i) ?? String(i)),
    [data, getRowId],
  )
  const selected = selectedIds ?? []
  const allSelected = data.length > 0 && ids.every((id) => selected.includes(id))
  const someSelected = ids.some((id) => selected.includes(id)) && !allSelected

  const toggleOne = (id: string) => {
    if (!onSelectionChange) return
    onSelectionChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])
  }
  const toggleAll = () => {
    if (!onSelectionChange) return
    onSelectionChange(
      allSelected
        ? selected.filter((s) => !ids.includes(s))
        : [...selected, ...ids.filter((id) => !selected.includes(id))],
    )
  }

  // Pair each row with its stable id so the selection column can render.
  const wrapped = useMemo<WrappedRow<T>[]>(
    () => data.map((row, i) => ({ __row: row, __id: ids[i] ?? String(i) })),
    [data, ids],
  )

  const tableColumns: Column<WrappedRow<T>>[] = useMemo(() => {
    const cols: Column<WrappedRow<T>>[] = []
    if (selectable) {
      cols.push({
        key: '__select',
        label: '',
        width: '44px',
        render: ({ __id }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected.includes(__id)} onChange={() => toggleOne(__id)} label={`Select row ${__id}`} />
          </span>
        ),
      })
    }
    for (const col of visibleColumns) {
      cols.push({
        key: col.key,
        label: col.label,
        sortable: col.sortable,
        width: col.width,
        align: col.align,
        render: ({ __row }) =>
          col.render ? col.render(__row) : String((__row as Record<string, unknown>)[col.key] ?? ''),
      })
    }
    return cols
    // `toggleOne`/`selected` intentionally refresh the memo via `selected`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, selected, selectable])

  return (
    <div aria-label={ariaLabel}>
      {(columnToggle || selectable) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="ems-tabular text-xs text-muted-foreground" aria-live="polite">
            {selectable && selected.length > 0 ? `${selected.length} selected` : `${data.length} rows`}
          </div>
          <div className="flex items-center gap-2">
            {selectable && data.length > 0 && (
              <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-border text-accent focus-visible:ring-accent"
                  aria-label="Select all rows"
                />
                Select all
              </label>
            )}
            {columnToggle && (
              <div className="relative">
                <Button variant="secondary" size="sm" onClick={() => setShowToggle((v) => !v)}>
                  Columns
                </Button>
                {showToggle && (
                  <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-border bg-card p-2 shadow-lg" role="menu" aria-label="Toggle columns">
                    {columns.map((col) => {
                      const id = col.id ?? col.key
                      const isHidden = hidden.includes(id)
                      return (
                        <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={!isHidden}
                            onChange={() =>
                              setHidden((prev) => (isHidden ? prev.filter((h) => h !== id) : [...prev, id]))
                            }
                            className="h-4 w-4 rounded border-border text-accent focus-visible:ring-accent"
                          />
                          {col.label || id}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="[&_td]:ems-row [&_th]:ems-row">
        <Table
          columns={tableColumns}
          data={wrapped}
          stickyHeader={stickyHeader}
          pageSize={pageSize}
          onRowClick={onRowClick ? ({ __row }) => onRowClick(__row) : undefined}
          rowActions={rowActions ? ({ __row }) => rowActions(__row) : undefined}
          loadingState={loading ? <DataTableSkeleton rows={loadingRows} columns={Math.max(visibleColumns.length, 1)} /> : undefined}
          emptyState={
            <EmptyState
              icon={<Settings2 className="h-5 w-5" />}
              title={emptyTitle}
              description={emptyMessage}
              action={emptyAction}
            />
          }
        />
      </div>
    </div>
  )
}

function DataTableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="w-full" aria-label="Loading rows" role="status">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2 border-b border-border px-4 py-2">
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className="h-4 flex-1 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
