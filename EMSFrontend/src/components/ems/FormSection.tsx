import { type ReactNode } from 'react'

interface FormSectionProps {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  error?: string
  className?: string
}

/**
 * Titled form group (EMSFrontend.md §8.2): section heading + helper text +
 * inline error slot. Used by the onboarding wizard and employee edit pages so
 * every form section reads identically.
 */
export function FormSection({ title, description, action, children, error, className = '' }: FormSectionProps) {
  const errorId = `${title.toLowerCase().replace(/\s+/g, '-')}-section-error`
  return (
    <section className={`rounded-xl border border-border bg-card p-4 sm:p-5 ${className}`} aria-labelledby={errorId ? undefined : undefined}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="grid gap-3">{children}</div>
      {error && (
        <p id={errorId} className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
