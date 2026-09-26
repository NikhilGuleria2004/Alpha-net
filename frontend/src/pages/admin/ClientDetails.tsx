import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit3, Save, X, Building2, Mail, CreditCard, MapPin, CalendarDays } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { KpiChip } from '../../components/ui/KpiChip'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { formatDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'
import { getProjectsForClient } from '../../utils/clients'
import { validateEmail } from '../../utils/validation'
import type { Client } from '../../types/client'

interface ClientForm {
  name: string
  contactEmail: string
  paymentTerms: string
  billingAddress: string
}

function toForm(client: Client): ClientForm {
  return {
    name: client.name,
    contactEmail: client.contactEmail ?? '',
    paymentTerms: client.paymentTerms ?? '',
    billingAddress: client.billingAddress ?? '',
  }
}

// Flow Integration Phase 1 — Client profile (see /flowIntegration.md §5 Phase 1).
// Shows every stored client field plus the projects/invoices it is billed for.
// `?edit=1` switches the details card into an inline edit form so the list's
// "Edit" action and the profile's own Edit button share one code path.
export function ClientDetails() {
  const { clientId } = useParams<{ clientId: string }>()
  const { clients, projects, invoices, updateClient, isLoading } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [editParam, setEditParam] = useQueryParamState('edit', '', 'push')
  const isEditing = editParam === '1'

  const client = clients.find((c) => c.id === clientId)
  const [form, setForm] = useState<ClientForm>({ name: '', contactEmail: '', paymentTerms: '', billingAddress: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isCancelOpen, setIsCancelOpen] = useState(false)

  // Re-sync whenever the stored client changes (initial load, saved edit, or a
  // refresh picking up someone else's change).
  useEffect(() => {
    if (client) setForm(toForm(client))
  }, [client])

  const isDirty = Boolean(
    client &&
      isEditing &&
      (form.name.trim() !== client.name ||
        form.contactEmail.trim() !== (client.contactEmail ?? '') ||
        form.paymentTerms.trim() !== (client.paymentTerms ?? '') ||
        form.billingAddress.trim() !== (client.billingAddress ?? '')),
  )
  const unsavedBlocker = useUnsavedChanges(isDirty)

  // Projects are linked through the Phase 1 FK, falling back to the legacy
  // free-text name for projects that predate the backfill.
  const linkedProjects = useMemo(() => (client ? getProjectsForClient(client, projects) : []), [client, projects])
  const linkedProjectIds = useMemo(() => new Set(linkedProjects.map((p) => p.id)), [linkedProjects])
  const clientInvoices = useMemo(
    () => invoices.filter((invoice) => linkedProjectIds.has(invoice.projectId)),
    [invoices, linkedProjectIds],
  )
  const billedTotal = clientInvoices.reduce((sum, invoice) => sum + (invoice.total ?? 0), 0)
  const activeProjects = linkedProjects.filter((p) => p.status === 'active' || p.status === 'overdue').length
  const teamSize = new Set(linkedProjects.flatMap((p) => p.teamMemberIds)).size

  const setField = (field: keyof ClientForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const cancelEditing = () => {
    if (client) setForm(toForm(client))
    setErrors({})
    setIsCancelOpen(false)
    setEditParam('')
  }

  const handleCancel = () => {
    if (isDirty) setIsCancelOpen(true)
    else cancelEditing()
  }

  const handleSave = async () => {
    if (!client) return
    const newErrors: Record<string, string> = {}
    if (!form.name.trim()) newErrors.name = 'Client name is required'
    // The backend keys clients by normalized name (findOrCreateClient) and
    // PATCH /clients/:id does not check for collisions, so renaming onto an
    // existing client would silently create two rows with the same key. Block it
    // here instead.
    const normalizedName = form.name.trim().toLowerCase().replace(/\s+/g, ' ')
    const duplicate = clients.find((c) => c.id !== client.id && c.normalizedName === normalizedName)
    if (duplicate && !newErrors.name) newErrors.name = `"${duplicate.name}" already uses this name.`
    const email = form.contactEmail.trim()
    if (email) {
      const emailValidation = validateEmail(email)
      if (!emailValidation.valid) newErrors.contactEmail = emailValidation.message || 'Invalid email format'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsSaving(true)
    try {
      // PATCH /clients/:id is partial: omitted keys keep their stored value.
      // contactEmail is omitted when blank because the backend schema requires a
      // valid address for that field (an empty string would be rejected) — same
      // "leave blank to keep" convention as the password field on Edit User.
      const updated = await updateClient(client.id, {
        name: form.name.trim(),
        paymentTerms: form.paymentTerms.trim(),
        billingAddress: form.billingAddress.trim(),
        ...(email ? { contactEmail: email } : {}),
      })
      if (!updated) throw new Error('Client not found')
      setErrors({})
      setEditParam('')
      addToast('success', 'Client updated successfully')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update client')
    } finally {
      setIsSaving(false)
    }
  }

  if (!client) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/admin/clients')} leftIcon={<ArrowLeft className="h-4 w-4" />}>Back to Clients</Button>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        ) : (
          <EmptyState
            icon={<Building2 className="h-12 w-12" />}
            title="Client not found"
            description="This client may have been removed, or the link is out of date."
            action={<Button onClick={() => navigate('/admin/clients')}>Back to Clients</Button>}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin/clients')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
          <div className="flex items-center gap-4">
            <Avatar name={client.name} size="lg" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
                <Badge variant="info" size="sm">
                  {linkedProjects.length} {linkedProjects.length === 1 ? 'project' : 'projects'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{client.contactEmail || 'No contact email on file'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="secondary" onClick={handleCancel} disabled={isSaving} leftIcon={<X className="h-4 w-4" />}>Cancel</Button>
              <Button onClick={handleSave} loading={isSaving} disabled={isSaving} leftIcon={<Save className="h-4 w-4" />}>Save Changes</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditParam('1')} leftIcon={<Edit3 className="h-4 w-4" />}>Edit Client</Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold text-foreground">Client Details</h3>
            </div>
            {isEditing ? (
              <div className="p-5 space-y-4">
                <Input
                  label="Client Name"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  error={errors.name}
                  placeholder="Acme Corp"
                  required
                />
                <Input
                  label="Contact Email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setField('contactEmail', e.target.value)}
                  error={errors.contactEmail}
                  placeholder="billing@acme.com"
                  helperText={client.contactEmail ? 'Leave blank to keep the current email.' : 'Used as the invoice recipient for this client.'}
                  autoComplete="email"
                />
                <Input
                  label="Payment Terms"
                  value={form.paymentTerms}
                  onChange={(e) => setField('paymentTerms', e.target.value)}
                  placeholder="Net 30"
                  helperText="Terms copied onto invoices raised for this client."
                />
                <Textarea
                  label="Billing Address"
                  rows={4}
                  value={form.billingAddress}
                  onChange={(e) => setField('billingAddress', e.target.value)}
                  placeholder="Street, City, State, ZIP"
                />
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <DetailRow label="Contact Email" value={client.contactEmail} icon={<Mail className="h-4 w-4" />} />
                <DetailRow label="Payment Terms" value={client.paymentTerms} icon={<CreditCard className="h-4 w-4" />} />
                <DetailRow label="Billing Address" value={client.billingAddress} icon={<MapPin className="h-4 w-4" />} />
                <DetailRow label="Client Since" value={formatDate(client.createdAt)} icon={<CalendarDays className="h-4 w-4" />} />
                <DetailRow label="Last Updated" value={formatDate(client.updatedAt)} icon={<CalendarDays className="h-4 w-4" />} />
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold text-foreground">Billing Summary</h3>
            </div>
            <div className="flex flex-wrap gap-2 p-5">
              <KpiChip label="Projects" value={linkedProjects.length} />
              <KpiChip label="Active" value={activeProjects} color="success" />
              <KpiChip label="Team Members" value={teamSize} />
              <KpiChip label="Invoices" value={clientInvoices.length} />
              <KpiChip label="Total Billed" value={formatCurrency(billedTotal)} color="info" />
            </div>
          </Card>

          <Card>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold text-foreground">Linked Projects ({linkedProjects.length})</h3>
            </div>
            <div className="p-5">
              {linkedProjects.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="h-12 w-12" />}
                  title="No projects linked yet"
                  description="A project links to this client when its client name matches, or once a project is saved with this client selected."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        {['Project', 'SOW', 'Deadline', 'Team', 'Status'].map((label) => (
                          <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {linkedProjects.map((project) => (
                        <tr key={project.id} className="cursor-pointer hover:bg-muted" onClick={() => navigate(`/admin/projects/${project.id}`)}>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{project.name}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{project.sowNumber}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(project.deadline)}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{project.teamMemberIds.length}</td>
                          <td className="px-4 py-3"><StatusBadge status={project.status} size="sm" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={isCancelOpen}
        title="Discard unsaved changes?"
        message="Your edits to this client have not been saved. Leaving now will lose them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        variant="danger"
        onConfirm={cancelEditing}
        onCancel={() => setIsCancelOpen(false)}
      />

      <ConfirmDialog
        open={unsavedBlocker.state === 'blocked'}
        title="Discard unsaved changes?"
        message="You have unsaved client details. Leaving this page will lose them."
        confirmLabel="Discard changes"
        cancelLabel="Stay on this page"
        variant="danger"
        onConfirm={() => unsavedBlocker.state === 'blocked' && unsavedBlocker.proceed()}
        onCancel={() => unsavedBlocker.state === 'blocked' && unsavedBlocker.reset()}
      />
    </div>
  )
}

interface DetailRowProps {
  label: string
  value?: string
  icon: ReactNode
}

function DetailRow({ label, value, icon }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm text-foreground">{value?.trim() ? value : '—'}</p>
      </div>
    </div>
  )
}
