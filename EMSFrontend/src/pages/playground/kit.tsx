import { type ReactNode } from 'react'

/** Titled block inside a playground section. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">{children}</div>
    </section>
  )
}

/** One labelled row of samples inside a section. */
export function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="ems-overline text-muted-foreground">{label}</span>}
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}
