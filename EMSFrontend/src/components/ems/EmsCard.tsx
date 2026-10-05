import { type ReactNode, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface EmsCardProps {
  title?: string
  subtitle?: string
  /** Right-side header slot (actions, `⋯` menus, count chips). */
  action?: ReactNode
  children: ReactNode
  /** `tight` strips padding for tables; `none` removes the card chrome. */
  padding?: 'default' | 'tight' | 'none'
  className?: string
}

/**
 * EMS panel wrapper (EMSFrontend.md §8.2): `Card` + Title-Case header +
 * action slot. Identical header grammar for every dashboard widget and module
 * section so scanning is uniform.
 */
export function EmsCard({ title, subtitle, action, children, padding = 'default', className = '' }: EmsCardProps) {
  const bodyClass = padding === 'none' ? '' : padding === 'tight' ? 'p-2 sm:p-3' : 'p-4 sm:p-5'
  return (
    <section className={`rounded-xl border border-border bg-card ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>}
            {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

interface CollapsiblePanelProps extends EmsCardProps {
  defaultOpen?: boolean
}

/** `EmsCard` whose body collapses — for stacked dashboard sections. */
export function CollapsiblePanel({ defaultOpen = true, children, ...rest }: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <EmsCard
      {...rest}
      action={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${rest.title ?? 'section'}` : `Expand ${rest.title ?? 'section'}`}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
        </button>
      }
    >
      {open ? children : null}
    </EmsCard>
  )
}
