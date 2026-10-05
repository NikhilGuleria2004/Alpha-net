import { Inbox } from 'lucide-react'
import { EmptyState } from '../components/ui/EmptyState'

interface RoutePlaceholderProps {
  /** Page heading — mirrors the route's `handle.title` / `handle.breadcrumb`. */
  title: string
  /** Which phase delivers the real screen (spec §14). */
  note?: string
}

/**
 * Skeleton page for every route registered ahead of its phase
 * (EMSFrontend.md §14 Phase 2 2.7): title + breadcrumb (via the route handle)
 * + EmptyState, so the stakeholder can walk the whole information
 * architecture with no dead ends.
 */
export function RoutePlaceholder({ title, note }: RoutePlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      </div>
      <EmptyState
        icon={<Inbox className="h-8 w-8" aria-hidden="true" />}
        title="Nothing here yet"
        description="This screen is scheduled for a later phase of the build — see EMSFrontend.md §14 for the phase order."
      />
    </div>
  )
}
