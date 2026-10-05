/**
 * New project form (EMSFrontend.md §7.7, Phase 6).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useToast } from '../../contexts/ToastContext'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { FormSection } from '../../components/ems/FormSection'
import { DatePicker } from '../../components/ui/DatePicker'
import { createProject, getClients } from '../../services/commercialService'
import { PAYMENT_TERMS } from '../../utils/paymentTerms'
import type { Client } from '../../types/client'
import type { ProjectStatus } from '../../types/project'

const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'draft', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'archived', label: 'Archived' },
]

export function ManagerProjectNewPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const preselectedClientId = (location.state as { clientId?: string })?.clientId ?? ''
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getClients()
      .then((result) => {
        if (!cancelled) setClients(result.clients)
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load clients.')
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const clientOptions = useMemo(
    () => [
      {
        value: '',
        label: clientsLoading ? 'Loading clients…' : clients.length === 0 ? 'No clients available' : 'Select a client…',
        disabled: clientsLoading || clients.length === 0,
      },
      ...clients.map((c) => ({ value: c.id, label: c.name })),
    ],
    [clients, clientsLoading],
  )

  const initialForm = {
    name: '',
    clientId: preselectedClientId,
    sowNumber: '',
    description: '',
    startDate: '',
    endDate: '',
    deadline: '',
    paymentTerms: '',
    billRateDefault: '',
    status: 'draft' as ProjectStatus,
  }

  const [form, setForm] = useState(() => ({ ...initialForm, clientId: preselectedClientId }))
  const isDirty = JSON.stringify(form) !== JSON.stringify({ ...initialForm, clientId: preselectedClientId })
  useUnsavedChanges(isDirty && !saving)

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Project name is required.'
    if (!form.clientId) e.clientId = 'Select a client.'
    if (!form.sowNumber.trim()) e.sowNumber = 'SOW number is required.'
    if (!form.startDate) e.startDate = 'Start date is required.'
    if (!form.endDate) e.endDate = 'End date is required.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      await createProject({
        name: form.name,
        clientId: form.clientId,
        sowNumber: form.sowNumber,
        poCap: form.paymentTerms ? undefined : undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        deadline: form.deadline || form.endDate,
        description: form.description,
        skillsRequired: [],
        billRateDefault: form.billRateDefault ? Number(form.billRateDefault) : undefined,
        status: form.status,
      })
      addToast('success', `${form.name} created.`)
      navigate('/manager/projects')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Could not create project.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormSection title="Project Details" description="Project scope, client, and timeline.">
        <Input
          label="Project Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
          required
        />
        <Select
          label="Client"
          value={form.clientId}
          onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          options={clientOptions}
          error={errors.clientId}
          disabled={clientsLoading}
          required
        />
        <Input
          label="SOW Number"
          value={form.sowNumber}
          onChange={(e) => setForm({ ...form, sowNumber: e.target.value })}
          error={errors.sowNumber}
          placeholder="e.g. SOW-2026-042"
          required
        />
        <Textarea
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What is this project about?"
        />
        <Select
          label="Payment Terms"
          value={form.paymentTerms}
          onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
          options={[{ value: '', label: 'Default' }, ...PAYMENT_TERMS]}
        />
      </FormSection>

      <FormSection title="Timeline" description="Project schedule and deadline.">
        <DatePicker
          label="Start Date"
          value={form.startDate}
          onChange={(val) => setForm({ ...form, startDate: val })}
          error={errors.startDate}
        />
        <DatePicker
          label="End Date"
          value={form.endDate}
          onChange={(val) => setForm({ ...form, endDate: val })}
          error={errors.endDate}
        />
        <DatePicker
          label="Deadline"
          value={form.deadline}
          onChange={(val) => setForm({ ...form, deadline: val })}
        />
      </FormSection>

      <FormSection title="Billing" description="Default bill rate for new assignments.">
        <Input
          label="Default Bill Rate ($/hr)"
          type="number"
          value={form.billRateDefault}
          onChange={(e) => setForm({ ...form, billRateDefault: e.target.value })}
          placeholder="e.g. 140"
        />
        <Select
          label="Status"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
          options={PROJECT_STATUSES}
        />
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => navigate('/manager/projects')} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={saving}>
          Create Project
        </Button>
      </div>
    </form>
  )
}
