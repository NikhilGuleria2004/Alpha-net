import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { DataTable } from '../../components/ems/DataTable'
import { FilterBar } from '../../components/ems/FilterBar'
import { EmsCard } from '../../components/ems/EmsCard'
import { Badge } from '../../components/ui/Badge'
import type { Column } from '../../components/ems/DataTable'
import type { EmsDocument, DocumentKind } from '../../types/document'
import { formatDateAutoYear, isOverdue } from '../../utils/date'
import { getDocuments } from '../../services/hrService'

const DOCUMENT_KINDS: { value: DocumentKind | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'id_proof', label: 'ID Proof' },
  { value: 'contract', label: 'Contract' },
  { value: 'tax_form', label: 'Tax Form' },
  { value: 'visa', label: 'Visa' },
  { value: 'other', label: 'Other' },
]

const STATUS_COLORS: Record<EmsDocument['status'], 'success' | 'warning' | 'danger' | 'default'> = {
  pending: 'warning',
  verified: 'success',
  expired: 'danger',
}

export function MyDocumentsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [documents, setDocuments] = useState<EmsDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const showLoading = useDelayedLoading(loading)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<DocumentKind | ''>('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getDocuments()
      .then((result) => {
        if (!cancelled) setDocuments(result.documents)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load documents'))
          addToast('error', 'Could not load documents.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const myDocs = useMemo(() => user ? documents.filter((d) => d.userId === user.id) : documents, [documents, user])

  const filtered = useMemo(() => myDocs.filter((d) => {
    const q = search.toLowerCase()
    if (q && !(d.name.toLowerCase().includes(q) || d.kind.toLowerCase().includes(q))) return false
    if (kindFilter && d.kind !== kindFilter) return false
    return true
  }), [myDocs, search, kindFilter])

  const expiring = useMemo(() => filtered.filter((d) => d.expiresAt && isOverdue(d.expiresAt)), [filtered])

  if (showLoading) {
    return (
      <EmsCard>
        <div className="py-12 text-center text-muted-foreground">Loading documents…</div>
      </EmsCard>
    )
  }

  if (error) {
    return (
      <EmsCard>
        <div className="py-12 text-center text-destructive">Failed to load documents</div>
      </EmsCard>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.filter((d) => d.status === 'verified').length} verified · {expiring.length} expiring/expired
          </p>
        </div>
      </div>

      {expiring.length > 0 && (
        <EmsCard title="Expiring Soon" subtitle="Action required">
          <div className="space-y-2">
            {expiring.slice(0, 3).map((d) => (
              <div key={d.id} className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-foreground">{d.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">expires {formatDateAutoYear(d.expiresAt!)}</span>
                </div>
                <Badge variant="danger" size="sm">Action</Badge>
              </div>
            ))}
          </div>
        </EmsCard>
      )}

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search documents…"
        onClearAll={() => { setSearch(''); setKindFilter('') }}
        actions={
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as DocumentKind | '')}
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Filter by type"
          >
            {DOCUMENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        }
      />

      <DataTable columns={columns} data={filtered} pageSize={10} emptyTitle="No documents" emptyMessage="You don't have any documents yet." />
    </div>
  )
}

const columns: Column<EmsDocument>[] = [
  { key: 'name', label: 'Document', render: (row) => <span className="font-medium">{row.name}</span> },
  { key: 'kind', label: 'Kind', render: (row) => <span className="text-sm">{row.kind.replace('_', ' ')}</span> },
  { key: 'status', label: 'Status', render: (row) => <Badge variant={STATUS_COLORS[row.status]} size="sm">{row.status}</Badge> },
  { key: 'expiresAt', label: 'Expires', render: (row) => <span className="ems-tabular text-xs">{row.expiresAt ? formatDateAutoYear(row.expiresAt) : '—'}</span> },
  { key: 'createdAt', label: 'Uploaded', render: (row) => <span className="ems-tabular text-xs">{formatDateAutoYear(row.createdAt)}</span> },
]
