import { useMemo, useState, type ReactNode } from 'react'
import { LayoutGrid } from 'lucide-react'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'

interface BoardColumnCard<T> {
  key: string
  title: string
  items: T[]
  renderItem: (item: T) => ReactNode
  emptyText?: string
}

interface BoardProps<T> {
  columns: BoardColumnCard<T>[]
  onMove?: (item: T, toColumn: string) => void
  moveTargets?: string[]
  getItemId?: (item: T) => string
  ariaLabel?: string
  className?: string
}

/**
 * Kanban board with click/keyboard equivalents for DnD (EMSFrontend.md §8.2).
 * HTML5 drag-and-drop is the fast path; the per-card "Move to ▸" menu and the
 * column-level move buttons are the keyboard path — guide "Gestures have
 * alternatives".
 */
export function Board<T>({
  columns,
  onMove,
  moveTargets,
  getItemId,
  ariaLabel = 'Board',
  className = '',
}: BoardProps<T>) {
  const [dragging, setDragging] = useState<string | null>(null)

  const targetsFor = useMemo(
    () => (fromKey: string) => (moveTargets ?? columns.map((c) => c.key)).filter((k) => k !== fromKey),
    [moveTargets, columns],
  )

  return (
    <div className={`grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 ${className}`} role="group" aria-label={ariaLabel}>
      {columns.map((column) => (
        <Card key={column.key} className="flex min-h-40 flex-col">
          <div className="ems-row flex items-center justify-between border-b border-border px-3">
            <h3 className="ems-overline text-muted-foreground">{column.title}</h3>
            <span className="ems-tabular rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" aria-label={`${column.items.length} items`}>
              {column.items.length}
            </span>
          </div>
          <div
            className="flex flex-1 flex-col gap-2 p-2"
            onDragOver={onMove ? (e) => e.preventDefault() : undefined}
            onDrop={
              onMove
                ? (e) => {
                    e.preventDefault()
                    const raw = e.dataTransfer.getData('application/json')
                    if (!raw) return
                    try {
                      const item = JSON.parse(raw) as T
                      onMove(item, column.key)
                    } catch {
                      // Non-board payload — ignore.
                    }
                    setDragging(null)
                  }
                : undefined
            }
          >
            {column.items.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                {column.emptyText ?? 'No items'}
              </p>
            )}
            {column.items.map((item, index) => {
              const itemId = getItemId?.(item) ?? `${column.key}-${index}`
              const isDragging = dragging === itemId
              return (
                <div
                  key={itemId}
                  draggable={Boolean(onMove)}
                  onDragStart={
                    onMove
                      ? (e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify(item))
                          e.dataTransfer.effectAllowed = 'move'
                          setDragging(itemId)
                        }
                      : undefined
                  }
                  onDragEnd={onMove ? () => setDragging(null) : undefined}
                  className={`rounded-lg border border-border bg-card p-2 ${isDragging ? 'opacity-50' : ''}`}
                >
                  {column.renderItem(item)}
                  {onMove && targetsFor(column.key).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 border-t border-border pt-1.5" role="group" aria-label={`Move item ${index + 1} to`}>
                      {targetsFor(column.key).map((target) => (
                        <button
                          key={target}
                          type="button"
                          onClick={() => onMove(item, target)}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          → {columns.find((c) => c.key === target)?.title ?? target}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ))}
      {columns.length === 0 && (
        <EmptyState
          icon={<LayoutGrid className="h-5 w-5" />}
          title="No columns"
          description="There is nothing to show on this board yet."
        />
      )}
    </div>
  )
}
