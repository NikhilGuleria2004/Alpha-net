import { type ReactNode, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleCardProps {
  title: string
  meta?: ReactNode
  defaultOpen?: boolean
  badge?: ReactNode
  children: ReactNode
  className?: string
}

const PANEL_ID_PREFIX = 'collapsible-card-panel'

let panelCounter = 0

/**
 * Expand/collapse section for dashboard widgets and detail tabs
 * (EMSFrontend.md §8.2): keeps maximalist pages scannable while preserving
 * content for search and screen readers (`hidden`, not unmounted).
 */
export function CollapsibleCard({ title, meta, defaultOpen = true, badge, children, className = '' }: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [panelId] = useState(() => `${PANEL_ID_PREFIX}-${(panelCounter += 1)}`)

  return (
    <section className={`rounded-xl border border-border bg-card ${className}`}>
      <h3 className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[32px] min-w-0 flex-1 items-center gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
          {badge && <span className="shrink-0">{badge}</span>}
        </button>
        {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      </h3>
      <div id={panelId} hidden={!open} className="border-t border-border px-4 py-3">
        {children}
      </div>
    </section>
  )
}
