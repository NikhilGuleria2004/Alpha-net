import { useState, useEffect } from 'react'
import { DataTable } from '../../components/ems/DataTable'
import { FilterBar } from '../../components/ems/FilterBar'
import { EmsCard } from '../../components/ems/EmsCard'
import { Badge } from '../../components/ui/Badge'
import type { Column } from '../../components/ems/DataTable'
import { getDocuments } from '../../services/hrService'
import { useToast } from '../../contexts/ToastContext'
import type { EmsDocument } from '../../types/document'
import { formatDateAutoYear } from '../../utils/date'

const DOCUMENT_KINDS = [
  { value: '', label: 'All Types' },
  { value: 'id_proof', label: 'ID Proof' },
  { value: 'contract', label: 'Contract' },
  { value: 'tax_form', label: 'Tax Form' },
  { value: 'visa', label: 'Visa' },
  { value: 'other', label: 'Other' },
]

const STATUS_COLORS: Record<EmsDocument['status'], 'success' | 'warning' | 'default' | 'danger'> = {
  pending: 'warning',
  verified: 'success',
  expired: 'danger',
}

export function HrDocumentsList() {
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('')

  const { addToast } = useToast()
  const [data, setData] = useState<{ documents: EmsDocument[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getDocuments()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to load documents'
        setError(message)
        addToast('error', message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const documents = data?.documents ?? []
  const filtered = documents.filter((d) => {
    const q = search.toLowerCase()
    if (q && !(d.name.toLowerCase().includes(q) || d.kind.toLowerCase().includes(q))) return false
    if (kindFilter && d.kind !== kindFilter) return false
    return true
  })

  if (error) {
    return <EmsCard title="Documents" subtitle={error}>{null}</EmsCard>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Documents</h1>
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search documents…"
        onClearAll={() => { setSearch(''); setKindFilter('') }}
        actions={
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Filter by document type"
          >
            {DOCUMENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        pageSize={15}
        loading={loading}
        emptyTitle="No documents"
        emptyMessage="Documents matching your filters will appear here."
      />
    </div>
  )
}

const columns: Column<EmsDocument>[] = [
  { key: 'name', label: 'Document', sortable: true, render: (row) => <span className="font-medium">{row.name}</span> },
  { key: 'kind', label: 'Kind', sortable: true, render: (row) => <span className="text-sm">{row.kind.replace('_', ' ')}</span> },
  { key: 'status', label: 'Status', sortable: true, render: (row) => <Badge variant={STATUS_COLORS[row.status]} size="sm">{row.status}</Badge> },
  { key: 'size', label: 'Size', align: 'right', render: (row) => <span className="ems-tabular text-xs">{(row.size / 1024).toFixed(0)} KB</span> },
  { key: 'expiresAt', label: 'Expires', sortable: true, render: (row) => <span className="ems-tabular text-xs">{row.expiresAt ? formatDateAutoYear(row.expiresAt) : '—'}</span> },
  { key: 'createdAt', label: 'Uploaded', sortable: true, render: (row) => <span className="ems-tabular text-xs">{formatDateAutoYear(row.createdAt)}</span> },
]
