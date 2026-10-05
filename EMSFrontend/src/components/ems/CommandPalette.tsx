import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/**
 * Cmd/Ctrl+K quick nav + actions (EMSFrontend.md 8.2 + 7.11).
 *
 * Phase 1 owns the overlay mechanics - global keybinding, focus trap +
 * restore, arrow-key navigation, live filtering - behind a stable Command/run
 * API so Phase 2 only swaps in the role-scoped registry from uiStore (plus
 * recent items + fuzzy ranking).
 */

export interface Command {
  id: string
  title: string
  hint?: string
  group?: string
  keywords?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: Command[]
  placeholder?: string
}

function matches(command: Command, query: string): boolean {
  const haystack = `${command.title} ${command.hint ?? ''} ${command.keywords ?? ''} ${command.group ?? ''}`.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((token) => haystack.includes(token))
}

export function CommandPalette({ open, onClose, commands, placeholder = 'Type a command or search...' }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useFocusTrap(open, panelRef, { onClose, initialFocus: 'container' })

  // Reset the query + selection each time the palette opens, then move focus
  // to the input on the next frame (after the portal mounts).
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      const frame = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
  }, [open])

  const results = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return commands
    return commands.filter((command) => matches(command, trimmed))
  }, [commands, query])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((prev) => (results.length === 0 ? 0 : (prev - 1 + results.length) % results.length))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const active = results[activeIndex]
        if (active) {
          active.run()
          onClose()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, results, activeIndex])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const grouped = useMemo(() => {
    const seen = new Set<string | undefined>()
    return results.map((command) => {
      const showGroup = !seen.has(command.group)
      seen.add(command.group)
      return { command, showGroup }
    })
  }, [results])

  const activeId = results[activeIndex]?.id

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card shadow-xl focus:outline-none"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="ems-command-list"
            aria-activedescendant={activeId ? `ems-command-${activeId}` : undefined}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
            placeholder={placeholder}
            aria-label={placeholder}
            autoComplete="off"
            className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="ems-tabular shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            esc
          </kbd>
        </div>
        <ul ref={listRef} id="ems-command-list" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-2">
          {grouped.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No commands match “{query}”.
            </li>
          )}
          {grouped.map(({ command, showGroup }) => {
            const isActive = command.id === activeId
            return (
              <div key={command.id}>
                {showGroup && command.group && (
                  <p className="ems-overline px-3 pb-1 pt-2 text-muted-foreground">{command.group}</p>
                )}
                <li
                  id={`ems-command-${command.id}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={results.indexOf(command)}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(results.indexOf(command))}
                    onClick={() => {
                      command.run()
                      onClose()
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      isActive ? 'bg-muted' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{command.title}</span>
                      {command.hint && <span className="block truncate text-xs text-muted-foreground">{command.hint}</span>}
                    </span>
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              </div>
            )
          })}
        </ul>
        <div aria-live="polite" className="sr-only">
          {results.length} result{results.length === 1 ? '' : 's'}
        </div>
      </div>
    </div>,
    document.body,
  )
}

