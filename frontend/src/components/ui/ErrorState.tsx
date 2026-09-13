import { type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from './Button'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  action?: ReactNode
}

export function ErrorState({ title = 'Something went wrong', description = 'We could not load this content. Please try again.', onRetry, retryLabel = 'Retry', action }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-red-200 bg-red-50 px-6 py-12 text-center">
      <div className="mb-4 text-red-400">
        <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4 flex items-center gap-3">
        {onRetry && (
          <Button variant="secondary" onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" />}>
            {retryLabel}
          </Button>
        )}
        {action}
      </div>
    </div>
  )
}
