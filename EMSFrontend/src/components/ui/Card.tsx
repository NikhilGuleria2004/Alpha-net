import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  hoverable?: boolean
}

export function Card({ children, className = '', onClick, hoverable = false }: CardProps) {
  const interactive = Boolean(onClick) || hoverable
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-border bg-card ${interactive ? 'shadow-sm cursor-pointer transition-shadow hover:shadow-md' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children?: ReactNode
  className?: string
  title?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  dot?: boolean
}

export function CardHeader({ children, className = '', title, meta, action, dot = false }: CardHeaderProps) {
  if (!title && !meta && !action && !dot && children) {
    return <div className={`border-b border-border px-5 py-4 ${className}`}>{children}</div>
  }
  return (
    <div className={`border-b border-border px-5 py-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 truncate">
          {title != null && (
            <>
              {dot && <span className="h-4 w-0.5 shrink-0 rounded-full bg-accent" />}
              <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
            </>
          )}
          {children && !title && children}
        </div>
        {meta && <span className="text-[11px] font-medium text-muted-foreground">{meta}</span>}
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}

interface CardBodyProps {
  children: ReactNode
  className?: string
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>
}

interface CardFooterProps {
  children: ReactNode
  className?: string
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return <div className={`border-t border-border px-5 py-4 ${className}`}>{children}</div>
}
