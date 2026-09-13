interface LoadingStateProps {
  variant?: 'skeleton' | 'spinner'
  fullPage?: boolean
  className?: string
  label?: string
}

export function LoadingState({ variant = 'spinner', fullPage = false, className = '', label }: LoadingStateProps) {
  if (variant === 'skeleton') {
    return (
      <div className={`space-y-4 ${className}`} aria-label="Loading">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (fullPage) {
    return (
      <div className={`flex h-full w-full items-center justify-center ${className}`}>
        <div className="flex flex-col items-center gap-3">
          <svg className="h-8 w-8 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          {label && <p className="text-sm text-muted-foreground">{label}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-live="polite">
      <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label && <span className="ml-2 text-sm text-muted-foreground">{label}</span>}
    </div>
  )
}
