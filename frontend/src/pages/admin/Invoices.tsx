import { useMemo } from 'react'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDateRange } from '../../utils/date'
import type { Invoice } from '../../types/invoice'

function InvoiceRow({ invoice, onEdit, onNavigate }: { invoice: Invoice; onEdit: (id: string) => void; onNavigate: (id: string) => void }) {
  return (
    <tr key={invoice.id} className="cursor-pointer hover:bg-muted" onClick={() => onNavigate(invoice.id)}>
      <td className="px-4 py-3 text-sm font-medium text-foreground">{invoice.invoiceNumber}</td>
      <td className="px-4 py-3 text-sm text-foreground">{invoice.projectName}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{invoice.periodLabel || formatDateRange(invoice.weekStart, invoice.weekEnd)}</td>
      <td className="px-4 py-3 text-right text-sm font-medium text-foreground">${invoice.total.toFixed(2)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={invoice.status} size="sm" />
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(invoice.id) }}>Edit</Button>
      </td>
    </tr>
  )
}

export function Invoices() {
  const { invoices, projects, isLoading } = useAppData()
  const navigate = useNavigate()

  const [search, setSearch] = useQueryParamState('q')
  const [projectFilter, setProjectFilter] = useQueryParamState('project', '', 'push')
  const [statusFilter, setStatusFilter] = useQueryParamState('status', '', 'push')

  const projectOptions = useMemo(() => projects.map((p) => ({ value: p.id, label: p.name })), [projects])

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (search.trim()) {
        const lower = search.toLowerCase()
        if (!inv.invoiceNumber.toLowerCase().includes(lower) && !inv.projectName.toLowerCase().includes(lower)) {
          return false
        }
      }
      if (projectFilter && inv.projectId !== projectFilter) return false
      if (statusFilter && inv.status !== statusFilter) return false
      return true
    })
  }, [invoices, search, projectFilter, statusFilter])

  const handleClear = () => {
    setSearch('')
    setProjectFilter('')
    setStatusFilter('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">View and manage project invoices.</p>
        </div>
        <Button onClick={() => navigate('/admin/invoices/new')} leftIcon={<Plus className="h-4 w-4" />}>
          New Invoice
        </Button>
      </div>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <Input
                placeholder="Search by invoice number or project…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="w-44"
                options={[{ value: '', label: 'All Projects' }, ...projectOptions]}
              />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-36"
                options={[{ value: '', label: 'All Statuses' }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }]}
              />
              <Button variant="secondary" onClick={handleClear} leftIcon={<SlidersHorizontal className="h-4 w-4" />}>
                Clear
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted mb-2" />
              ))}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No invoices found"
                description="Create a new invoice to get started."
                action={<Button onClick={() => navigate('/admin/invoices/new')} leftIcon={<Plus className="h-4 w-4" />}>New Invoice</Button>}
              />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Period</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} onEdit={(id) => navigate(`/admin/invoices/${id}/form`)} onNavigate={(id) => navigate(`/admin/invoices/${id}`)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
