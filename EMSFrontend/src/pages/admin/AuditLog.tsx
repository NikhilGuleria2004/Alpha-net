/**
 * Audit Log — `/admin/audit` (EMSFrontend.md §7.9, Appendix B).
 *
 * Admin-only (`viewAuditLog` capability in the nav, `requireRole('admin')` on
 * the endpoint). Reads the shared append-only `activities` collection via
 * `GET /audit`, the same feed the admin dashboard's `recentAudit` widget draws,
 * so both surfaces share one `AuditEvent` shape.
 *
 * Pagination is **server-side**: the endpoint skips/limits and returns `total`
 * for the whole match, so the rows are handed to `Table` with `pageSize={0}`
 * (render-all, no client pager) and this page drives its own pager. Wrapping a
 * 25-row server page in the client pager would silently hide 15 rows a page.
 *
 * Filter and page live in the URL (`useQueryParamState`) per interface_guide's
 * "URL as state" / "deep-link everything" rules, so an audit view can be shared
 * or reloaded without losing context.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { EmsCard } from '../../components/ems/EmsCard'
import { FilterBar, type FilterChip } from '../../components/ems/FilterBar'
import { DataTable, type Column } from '../../components/ems/DataTable'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { formatDateTime } from '../../utils/date'
import type { AuditEvent, AuditListResult, AuditSeverity } from '../../types/dashboard'
import {
  getAuditEvents,
  auditEntityLabel,
  AUDIT_ENTITY_TYPES,
} from '../../services/auditService'

/** Backend default; the service clamps anything higher to 100. */
const PAGE_SIZE = 25

const SEVERITY_VARIANT: Record<AuditSeverity, 'default' | 'warning' | 'danger'> = {
  info: 'default',
  warning: 'warning',
  error: 'danger',
}

export function AdminAuditLogPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [entityType, setEntityType] = useQueryParamState('type', 'all', 'push')
  const [pageParam, setPageParam] = useQueryParamState('page', '1')
  const [data, setData] = useState<AuditListResult | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // Guard against a hand-edited `?page=0` / `?page=abc` — the backend coerces,
  // but the pager's "Page N of M" arithmetic should never see NaN.
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1)
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getAuditEvents({
      entityType: entityType === 'all' ? undefined : entityType,
      page,
      limit: PAGE_SIZE,
    })
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load the audit log'))
          addToast('error', 'Could not load the audit log.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [entityType, page, addToast])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || PAGE_SIZE))) : 1

  const chips = useMemo<FilterChip[]>(
    () =>
      AUDIT_ENTITY_TYPES.map((slug) => ({
        id: slug,
        label: slug === 'all' ? 'All' : auditEntityLabel(slug),
        active: entityType === slug,
        onToggle: () => {
          // Any filter change invalidates the current page offset.
          setPageParam('1')
          setEntityType(slug)
        },
      })),
    [entityType, setEntityType, setPageParam],
  )

  const columns = useMemo<Column<AuditEvent>[]>(
    () => [
      {
        key: 'timestamp',
        label: 'When',
        width: '190px',
        sortable: true,
        render: (row) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {row.timestamp ? formatDateTime(row.timestamp) : '—'}
          </span>
        ),
      },
      {
        key: 'description',
        label: 'Event',
        render: (row) => <span className="font-medium text-foreground">{row.description}</span>,
      },
      {
        key: 'actor',
        label: 'Actor',
        width: '180px',
        sortable: true,
        render: (row) => <span className="text-sm">{row.actor}</span>,
      },
      {
        key: 'severity',
        label: 'Severity',
        width: '110px',
        render: (row) => (
          <Badge variant={SEVERITY_VARIANT[row.severity] ?? 'default'} size="sm">
            {row.severity}
          </Badge>
        ),
      },
    ],
    [],
  )

  const goToPage = (next: number) => setPageParam(String(Math.min(Math.max(1, next), totalPages)))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only activity across clients, projects, people and finance · Signed in as{' '}
          {user?.name ?? '…'}
        </p>
      </div>

      <FilterBar chips={chips} />

      <EmsCard
        title="Events"
        subtitle={
          data
            ? `${data.total} ${data.total === 1 ? 'event' : 'events'} · page ${data.page} of ${totalPages}`
            : undefined
        }
        action={
          totalPages > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ChevronLeft className="h-4 w-4" />}
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ChevronRight className="h-4 w-4" />}
                disabled={page >= totalPages}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </Button>
            </div>
          ) : undefined
        }
      >
        <DataTable
          ariaLabel="Audit log events"
          columns={columns}
          data={data?.events ?? []}
          getRowId={(row) => row.id}
          // Server-paginated: render the fetched page as-is and let the card
          // header own paging. See the module note.
          pageSize={0}
          loading={loading}
          stickyHeader={false}
          emptyTitle="No audit events"
          emptyMessage={
            entityType === 'all'
              ? 'Activity will appear here as people use the system.'
              : `No ${auditEntityLabel(entityType).toLowerCase()} events recorded.`
          }
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
      </EmsCard>
    </div>
  )
}
