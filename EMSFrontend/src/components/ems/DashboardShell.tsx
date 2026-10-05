import { type ReactNode } from 'react'
import { Skeleton } from '../ui/Skeleton'
import { ErrorState } from '../ui/ErrorState'

interface DashboardShellProps<T> {
  /** Page heading rendered below the greeting. */
  title: string
  /** Optional subtext (e.g. the role's last-updated time). */
  subtitle?: ReactNode
  /** Loading skeleton count for the KPI strip. */
  kpiCount?: number
  /** Renders the dashboard body once data is loaded. */
  children: (data: T) => ReactNode
  /** When true, the shell renders skeleton placeholders. */
  loading: boolean
  /** Error to display in the error state. */
  error: Error | null
  /** The resolved data — passed to `children` when neither loading nor errored. */
  data: T | null
  /** Optional retry handler for the error state. */
  onRetry?: () => void
}

/**
 * Shared dashboard container (EMSFrontend.md §7.3 common chrome, §9.4).
 *
 * Encapsulates the skeleton → data → empty → error lifecycle so every dashboard
 * page follows the same state machine. Renders a greeting header, the child
 * content, and wires the `ErrorState` retry back to `onRetry`.
 */
export function DashboardShell<T>({
  title,
  subtitle,
  kpiCount = 5,
  children,
  loading,
  error,
  data,
  onRetry,
}: DashboardShellProps<T>) {
  return (
    <div className="space-y-6" aria-labelledby="dashboard-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 id="dashboard-title" className="text-xl font-semibold text-foreground">
            {title}
          </h1>
          {subtitle && <p className="ems-text-label text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      {loading && <DashboardSkeleton kpiCount={kpiCount} />}

      {error && (
        <ErrorState
          title="Unable to load dashboard"
          description={error.message}
          onRetry={onRetry}
        />
      )}

      {!loading && !error && data && children(data)}    </div>
  )
}

function DashboardSkeleton({ kpiCount }: { kpiCount: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: kpiCount }).map((_, i) => (
          <div key={i} className="h-[72px] w-full rounded-xl border border-border bg-card p-3">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="mt-2 h-6 w-3/5" />
            <Skeleton className="mt-1 h-3 w-2/5" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Skeleton className="h-[220px] w-full rounded-xl border border-border bg-card" />
        </div>
        <div className="xl:col-span-4">
          <Skeleton className="h-[220px] w-full rounded-xl border border-border bg-card" />
        </div>
      </div>
      <Skeleton className="h-[180px] w-full rounded-xl border border-border bg-card" />
    </div>
  )
}
