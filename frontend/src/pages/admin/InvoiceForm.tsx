import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { KpiChip } from '../../components/ui/KpiChip'
import { EmptyState } from '../../components/ui/EmptyState'
import { createInvoice as createInvoiceService, getInvoiceById, updateInvoice as updateInvoiceService } from '../../services/invoiceService'
import type { VariableCost } from '../../types/invoice'

export function InvoiceForm() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projects, timesheets, refreshInvoices } = useAppData()
  const { addToast } = useToast()

  // The edit route is /admin/invoices/:invoiceId/form — the route param is the
  // INVOICE id, never a project id. The create route (/admin/invoices/new) has
  // no params at all.
  const isEdit = Boolean(invoiceId)
  const initialProjectId = searchParams.get('projectId') ?? ''

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  const [hourlyRate, setHourlyRate] = useState(0)
  const [variableCosts, setVariableCosts] = useState<VariableCost[]>([{ id: '', amount: 0, reason: '' }])
  // Edit mode only: hours the invoice was created with, and its stored fixed
  // cost (legacy invoices created before project-total billing carry neither).
  const [editBillableHours, setEditBillableHours] = useState<number | null>(null)
  const [editFixedCost, setEditFixedCost] = useState(0)

  const project = projects.find((p) => p.id === selectedProjectId) ?? null

  // TOTAL regular (billable) hours logged on the project across ALL of its
  // timesheets (every team member, every week) — matching the backend's
  // fixed-cost rule (regular Mon–Fri hours; overtime excluded).
  const billableHours = useMemo(() => {
    if (isEdit) return editBillableHours ?? 0
    if (!selectedProjectId) return 0
    let hours = 0
    for (const sheet of timesheets) {
      if (sheet.projectId !== selectedProjectId) continue
      for (const entry of sheet.entries ?? []) {
        if (entry.entryType === 'regular') {
          for (const day of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) {
            hours += (entry.hours?.[day] as number) ?? 0
          }
        }
      }
    }
    return hours
  }, [isEdit, editBillableHours, selectedProjectId, timesheets])

  // Fixed price is always derived: total hours × hourly rate (the rate is the
  // changeable part). In edit mode, fall back to the stored fixed cost for
  // legacy invoices that predate billableHours.
  const fixedCost = useMemo(() => {
    if (isEdit && editBillableHours == null) return editFixedCost
    return billableHours * hourlyRate
  }, [isEdit, editBillableHours, editFixedCost, billableHours, hourlyRate])

  useEffect(() => {
    if (!isEdit || !invoiceId) return
    getInvoiceById(invoiceId).then((invoice) => {
      if (invoice) {
        setSelectedProjectId(invoice.projectId)
        setHourlyRate(invoice.hourlyRate)
        setEditBillableHours(invoice.billableHours ?? null)
        setEditFixedCost(invoice.fixedCost)
        setVariableCosts(
          invoice.variableCosts.length
            ? invoice.variableCosts
            : [{ id: '', amount: 0, reason: '' }],
        )
      }
    })
  }, [isEdit, invoiceId])

  // Auto-pick the project's hourly rate whenever the project changes; the
  // admin can override it in the summary below.
  useEffect(() => {
    if (isEdit) return
    if (!project) {
      setHourlyRate(0)
      return
    }
    setHourlyRate(project.hourlyRate ?? 0)
  }, [isEdit, project])

  const variableCostTotal = variableCosts.reduce((sum, vc) => sum + (vc.amount || 0), 0)
  const total = fixedCost + variableCostTotal

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!isEdit && !selectedProjectId) {
      newErrors.projectId = 'Project is required'
    }
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      newErrors.hourlyRate = 'Hourly rate must be 0 or greater'
    }
    for (const [i, vc] of variableCosts.entries()) {
      if (vc.reason.trim() && !vc.amount) {
        newErrors[`vc-${i}-amount`] = 'Amount is required when reason is provided'
      }
      if (vc.amount && !vc.reason.trim()) {
        newErrors[`vc-${i}-reason`] = 'Reason is required when amount is provided'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      if (isEdit && invoiceId) {
        const costsToRemove = variableCosts.filter((vc) => vc.id && vc.amount === 0 && !vc.reason.trim())
        const costsToUpdate = variableCosts.filter((vc) => vc.amount > 0 || vc.reason.trim())
        const result = await updateInvoiceService(invoiceId, {
          // Only push the rate when the invoice carries its billable hours —
          // the backend recomputes fixedCost = hours × rate. Legacy invoices
          // without stored hours keep their original fixed cost.
          ...(editBillableHours != null ? { hourlyRate } : {}),
          addVariableCosts: costsToUpdate.map((vc) => ({ amount: vc.amount, reason: vc.reason })),
          removeVariableCostIds: costsToRemove.map((vc) => vc.id),
        })
        if (result) {
          addToast('success', 'Invoice updated successfully')
        }
      } else {
        const invoice = await createInvoiceService({
          projectId: selectedProjectId,
          hourlyRate,
        })
        const hasCosts = variableCosts.some((vc) => vc.amount > 0 || vc.reason.trim())
        if (hasCosts) {
          await updateInvoiceService(invoice.id, {
            addVariableCosts: variableCosts
              .filter((vc) => vc.amount > 0 || vc.reason.trim())
              .map((vc) => ({ amount: vc.amount, reason: vc.reason })),
          })
        }
        addToast('success', 'Invoice created successfully')
        await refreshInvoices()
        navigate(`/admin/invoices/${invoice.id}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save invoice'
      addToast('error', message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const addVariableCost = () => {
    setVariableCosts((prev) => [...prev, { id: '', amount: 0, reason: '' }])
  }

  const updateVariableCost = (index: number, field: keyof VariableCost, value: string | number) => {
    setVariableCosts((prev) => prev.map((vc, i) => (i === index ? { ...vc, [field]: value } : vc)))
    const key = field === 'amount' ? `vc-${index}-amount` : `vc-${index}-reason`
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: '' }))
    }
  }

  const removeVariableCost = (index: number) => {
    setVariableCosts((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin/invoices')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isEdit ? 'Update the rate and variable costs.' : 'Bill a project\u2019s total logged hours at an hourly rate.'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {!isEdit && (
          <Card>
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">Project</h2>
            </div>
            <div className="p-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value)
                  }}
                  className="w-full appearance-none rounded-full border border-border bg-muted px-3 h-9 text-base sm:text-sm text-foreground focus:outline-none focus:border-ring"
                >
                  <option value="">Select a project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {errors.projectId && <p className="mt-1 text-sm text-destructive">{errors.projectId}</p>}
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Invoice Summary</h2>
          </div>
          <div className="p-5 space-y-4">
            {project && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Project</span>
                <span className="text-sm font-medium text-foreground">{project.name}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Billable Hours</span>
              <KpiChip label="Hours" value={billableHours.toFixed(2)} color="info" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Hourly Rate ($/h)</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={(e) => {
                  const value = parseFloat(e.target.value)
                  setHourlyRate(Number.isFinite(value) ? value : 0)
                }}
                disabled={isEdit && editBillableHours == null}
                error={errors.hourlyRate}
                className="w-32 text-right"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fixed Cost ({billableHours.toFixed(2)} h × ${hourlyRate.toFixed(2)})</span>
              <span className="text-sm font-semibold text-foreground">${fixedCost.toFixed(2)}</span>
            </div>
            {!selectedProjectId && !isEdit && (
              <p className="text-sm text-muted-foreground">Pick a project — total hours fill in automatically from all of its timesheets, and the fixed price is hours × hourly rate.</p>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Variable Costs</span>
              <KpiChip label="Var" value={variableCostTotal.toFixed(2)} />
            </div>
            <hr className="border-border" />
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">${total.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Variable Costs</h2>
          </div>
          <div className="p-5 space-y-4">
            {variableCosts.length === 0 ? (
              <EmptyState title="No variable costs" description="Add variable cost lines below." />
            ) : (
              <div className="space-y-3">
                {variableCosts.map((vc, index) => (
                  <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Reason</label>
                      <Input
                        placeholder="Reason"
                        value={vc.reason}
                        onChange={(e) => updateVariableCost(index, 'reason', e.target.value)}
                        error={errors[`vc-${index}-reason`]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount ($)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={vc.amount || ''}
                        onChange={(e) => updateVariableCost(index, 'amount', parseFloat(e.target.value) || 0)}
                        error={errors[`vc-${index}-amount`]}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeVariableCost(index)} leftIcon={<Trash2 className="h-4 w-4" />}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="secondary" onClick={addVariableCost} leftIcon={<Plus className="h-4 w-4" />}>
              Add Variable Cost
            </Button>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/invoices')}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>
            {isEdit ? 'Save Changes' : 'Create Invoice'}
          </Button>
        </div>
      </form>
    </div>
  )
}
