import { useState, useMemo } from 'react'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, SlidersHorizontal, Download, ChevronUp, ChevronDown, MoreHorizontal, Building2, Eye, Edit3 } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown'
import { Avatar } from '../../components/ui/Avatar'
import { TableSkeleton } from '../../components/ui/Skeleton'
import { formatDate } from '../../utils/date'
import { getProjectsForClient } from '../../utils/clients'
import { validateEmail } from '../../utils/validation'
import type { CreateClientInput } from '../../types/client'

type SortDirection = 'asc' | 'desc'

// Flow Integration Phase 1 — Clients list (see /flowIntegration.md §5 Phase 1).
// Mirrors Projects/Users: URL-backed search, filter and sort, CSV export, and a
// row click that opens the client profile.
export function Clients() {
  const { clients, projects, createClient, isLoading } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [search, setSearch] = useQueryParamState('q')
  const [linkedFilter, setLinkedFilter] = useQueryParamState('linked', '', 'push')
  const [sort, setSort] = useQueryParamState('sort', '', 'push')
  const [dir, setDir] = useQueryParamState('dir', 'asc', 'push')
  const sortKey = sort || null
  const sortDir: SortDirection = dir === 'desc' ? 'desc' : 'asc'
  const setSortKey = (key: string | null): void => setSort(key ?? '')
  const setSortDir = (next: SortDirection | ((prev: SortDirection) => SortDirection)): void => {
    setDir((prev) => {
      const current: SortDirection = prev === 'desc' ? 'desc' : 'asc'
      return typeof next === 'function' ? next(current) : next
    })
  }

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState<CreateClientInput>({ name: '', contactEmail: '', paymentTerms: '', billingAddress: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const closeCreateModal = () => {
    setIsCreateOpen(false)
    setForm({ name: '', contactEmail: '', paymentTerms: '', billingAddress: '' })
    setErrors({})
  }

  const updateField = (field: keyof CreateClientInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  // One derived row per client: the linked projects drive the Projects column,
  // the filter and the CSV export, so they're computed once per change.
  const rows = useMemo(
    () =>
      clients.map((client) => {
        const linkedProjects = getProjectsForClient(client, projects)
        return {
          client,
          name: client.name,
          contactEmail: client.contactEmail ?? '',
          paymentTerms: client.paymentTerms ?? '',
          billingAddress: client.billingAddress ?? '',
          projectCount: linkedProjects.length,
          updatedAt: client.updatedAt,
        }
      }),
    [clients, projects],
  )

  const filteredRows = useMemo(() => {
    let data = rows
    if (search.trim()) {
      const lower = search.toLowerCase()
      data = data.filter(
        (row) =>
          row.name.toLowerCase().includes(lower) ||
          row.contactEmail.toLowerCase().includes(lower) ||
          row.paymentTerms.toLowerCase().includes(lower),
      )
    }
    if (linkedFilter === 'with') data = data.filter((row) => row.projectCount > 0)
    if (linkedFilter === 'without') data = data.filter((row) => row.projectCount === 0)
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const aVal = a[sortKey as keyof typeof a]
      const bVal = b[sortKey as keyof typeof b]
      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined || aVal === '') return 1
      if (bVal === null || bVal === undefined || bVal === '') return -1
      const comparison =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal))
      return sortDir === 'asc' ? comparison : -comparison
    })
  }, [rows, search, linkedFilter, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleCreate = async () => {
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = 'Client name is required'
    const email = form.contactEmail?.trim() ?? ''
    if (email) {
      const emailValidation = validateEmail(email)
      if (!emailValidation.valid) newErrors.contactEmail = emailValidation.message || 'Invalid email format'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsSubmitting(true)
    try {
      // POST /clients upserts on normalized name: an existing client comes back
      // unchanged instead of erroring, so report that case plainly.
      const normalizedInput = form.name.trim().toLowerCase().replace(/\s+/g, ' ')
      const alreadyExisted = clients.some((c) => c.normalizedName === normalizedInput)
      const client = await createClient({
        name: form.name.trim(),
        paymentTerms: form.paymentTerms?.trim() || undefined,
        billingAddress: form.billingAddress?.trim() || undefined,
        ...(email ? { contactEmail: email } : {}),
      })
      addToast(
        alreadyExisted ? 'info' : 'success',
        alreadyExisted ? `"${client.name}" already exists — opening its profile.` : 'Client created successfully',
      )
      closeCreateModal()
      navigate(`/admin/clients/${client.id}`)
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to create client')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExport = () => {
    const headers = ['Client', 'Contact Email', 'Payment Terms', 'Billing Address', 'Projects', 'Updated']
    const csvRows = filteredRows.map((row) => [
      row.name,
      row.contactEmail,
      row.paymentTerms,
      row.billingAddress,
      row.projectCount,
      formatDate(row.updatedAt),
    ])
    // Quote every cell and escape embedded quotes so addresses containing commas
    // or quotes keep their column alignment.
    const csv = [headers.join(','), ...csvRows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `clients-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
    addToast('success', 'Clients exported to CSV')
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <span className="text-muted-foreground" />
    return sortDir === 'asc' ? <ChevronUp className="h-4 w-4 text-accent" /> : <ChevronDown className="h-4 w-4 text-accent" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the clients that projects and invoices are billed to.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
          New Client
        </Button>
      </div>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search clients by name, email, or payment terms…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <Select
                value={linkedFilter}
                onChange={(e) => setLinkedFilter(e.target.value)}
                className="w-full sm:w-44"
                options={[
                  { value: '', label: 'All Clients' },
                  { value: 'with', label: 'With Projects' },
                  { value: 'without', label: 'Without Projects' },
                ]}
              />
              <Button variant="secondary" onClick={() => { setSearch(''); setLinkedFilter('') }} leftIcon={<SlidersHorizontal className="h-4 w-4" />} className="w-full sm:w-auto">Clear</Button>
              <Button variant="secondary" onClick={handleExport} leftIcon={<Download className="h-4 w-4" />} className="w-full sm:w-auto">Export</Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={8} columns={6} />
          ) : filteredRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Building2 className="h-12 w-12" />}
                title={clients.length === 0 ? 'No clients yet' : 'No clients match your filters'}
                description={
                  clients.length === 0
                    ? 'Clients are created automatically from a project’s client name, or you can add one here.'
                    : 'Try a different search term or clear the filters.'
                }
                action={
                  clients.length === 0 ? (
                    <Button onClick={() => setIsCreateOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>New Client</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  {[
                    { key: 'name', label: 'Client' },
                    { key: 'contactEmail', label: 'Contact Email' },
                    { key: 'paymentTerms', label: 'Payment Terms' },
                    { key: 'billingAddress', label: 'Billing Address' },
                    { key: 'projectCount', label: 'Projects' },
                    { key: 'updatedAt', label: 'Updated' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <SortIcon column={col.key} />
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((row) => (
                  <tr key={row.client.id} className="cursor-pointer hover:bg-muted" onClick={() => navigate(`/admin/clients/${row.client.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={row.name} size="sm" />
                        <span className="text-sm font-medium text-foreground">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{row.contactEmail || '—'}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{row.paymentTerms || '—'}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-sm text-muted-foreground" title={row.billingAddress || undefined}>
                      {row.billingAddress || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.projectCount > 0 ? (
                        <Badge variant="info" size="sm">{row.projectCount}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(row.updatedAt)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Dropdown
                        trigger={
                          <button type="button" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        }
                      >
                        <DropdownItem icon={<Eye className="h-4 w-4" />} onClick={() => navigate(`/admin/clients/${row.client.id}`)}>View</DropdownItem>
                        <DropdownItem icon={<Edit3 className="h-4 w-4" />} onClick={() => navigate(`/admin/clients/${row.client.id}?edit=1`)}>Edit</DropdownItem>
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isCreateOpen}
        onClose={closeCreateModal}
        title="New Client"
        description="Clients are matched by name — entering an existing name opens that client instead."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={closeCreateModal}>Cancel</Button>
            <Button onClick={handleCreate} loading={isSubmitting} disabled={isSubmitting}>Create Client</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Client Name"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            error={errors.name}
            placeholder="Acme Corp"
            required
          />
          <Input
            label="Contact Email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => updateField('contactEmail', e.target.value)}
            error={errors.contactEmail}
            placeholder="billing@acme.com"
            helperText="Used as the invoice recipient for this client."
            autoComplete="email"
          />
          <Input
            label="Payment Terms"
            value={form.paymentTerms}
            onChange={(e) => updateField('paymentTerms', e.target.value)}
            placeholder="Net 30"
          />
          <Textarea
            label="Billing Address"
            rows={3}
            value={form.billingAddress}
            onChange={(e) => updateField('billingAddress', e.target.value)}
            placeholder="Street, City, State, ZIP"
          />
        </div>
      </Modal>
    </div>
  )
}
