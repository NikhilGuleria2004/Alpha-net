/**
 * New client form (EMSFrontend.md §7.6, Phase 6).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../contexts/ToastContext'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { FormSection } from '../../components/ems/FormSection'
import { createClient } from '../../services/commercialService'
import type { CreateClientInput } from '../../types/client'
import { PAYMENT_TERMS } from '../../utils/paymentTerms'

export function ManagerClientNewPage() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const initialForm: CreateClientInput & { paymentTerms?: string } = {
    name: '',
    billingAddress: '',
    paymentTerms: '',
    contactEmail: '',
  }

  const [form, setForm] = useState(initialForm)
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm)
  useUnsavedChanges(isDirty && !saving)

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Client name is required.'
    if (form.contactEmail && !/\S+@\S+\.\S+/.test(form.contactEmail)) e.contactEmail = 'Enter a valid email address.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      await createClient(form)
      addToast('success', `${form.name} created.`)
      navigate('/manager/clients')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Could not create client.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormSection title="Client Details" description="Identity and billing contact for this client.">
        <Input
          label="Client Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
          required
        />
        <Input
          label="Contact Email"
          type="email"
          value={form.contactEmail ?? ''}
          onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          error={errors.contactEmail}
        />
        <Input
          label="Billing Address"
          value={form.billingAddress ?? ''}
          onChange={(e) => setForm({ ...form, billingAddress: e.target.value })}
        />
        <Select
          label="Payment Terms"
          value={form.paymentTerms ?? ''}
          onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
          options={PAYMENT_TERMS}
        />
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => navigate('/manager/clients')} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={saving}>
          Create Client
        </Button>
      </div>
    </form>
  )
}
