import { useDelayedLoading } from '../../hooks/useDelayedLoading'

// Full-screen loading state shared by the auth-aware route gates while the
// session is being restored from the httpOnly refresh cookie (QA A13).
export function FullPageSpinner({ label, isLoading = true }: { label?: string; isLoading?: boolean }) {
  // F-19: same gate as LoadingState, so a fast session restore shows nothing at all.
  const visible = useDelayedLoading(isLoading)
  if (!visible) return null

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="h-8 w-8 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="text-sm text-foreground">{label ?? 'Loading…'}
        </p>
      </div>
    </div>
  )
}
