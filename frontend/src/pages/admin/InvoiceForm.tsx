import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Save, Plus, Trash2, Pencil } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { KpiChip } from '../../components/ui/KpiChip'
import { EmptyState } from '../../components/ui/EmptyState'
import { createInvoice as createInvoiceService, getInvoiceById, updateInvoice as updateInvoiceService, updateInvoiceRates as updateInvoiceRatesService, previewInvoice } from '../../services/invoiceService'
import { focusFirstError } from '../../utils/focusFirstError'
import type { InvoiceLine, EmployeeBillingSummary, VariableCost, InvoiceRateUpdate } from '../../types/invoice'
import { failureMessage } from '../../utils/errorMessage'

/** Rounds money to cents — every displayed amount goes through this. */
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * One editable employee row of the invoice. In create mode the rows
 * come from the read-only preview (GET /invoices/preview); in edit
 * mode they are the invoice's own lines grouped per employee. Both
 * shapes are the backend's per-employee aggregation, so what the
 * admin sees is exactly what gets persisted.
 */
interface EmployeeRow {
  resourceId: string
  resourceName: string
  /** Summed billable (regular Mon–Fri) hours across the employee's timesheets. */
  hours: number
  /** Rate the row starts from: captured assignment rate, or the invoice rate. */
  defaultRate: number
  rateSource: 'assignment' | 'invoice' | 'manual'
  /** True when the employee's timesheets carry different captured rates. */
  mixedRates: boolean
  /** The timesheet ids behind the row — the edit flow sends these. */
  timesheetIds: string[]
}

function groupLinesByResource(lines: InvoiceLine[]): EmployeeRow[] {
  const byResource = new Map<string, InvoiceLine[]>()
  for (const line of lines) {
    const key = String(line.resourceId ?? '')
    if (!key) continue
    if (!byResource.has(key)) byResource.set(key, [])
    byResource.get(key)!.push(line)
  }
  return [...byResource.entries()].map(([resourceId, resourceLines]) => ({
    resourceId,
    resourceName: resourceLines[0].resourceName ?? 'Unknown resource',
    hours: resourceLines.reduce((sum, line) => sum + line.hours, 0),
    defaultRate: resourceLines[0].rate,
    rateSource: resourceLines[0].rateSource,
    mixedRates: new Set(resourceLines.map((line) => line.rate)).size > 1,
    timesheetIds: resourceLines.map((line) => line.timesheetId),
  }))
}

export function InvoiceForm() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projects, refreshInvoices } = useAppData()
  const { addToast } = useToast()

  // The edit route is /admin/invoices/:invoiceId/form — the route param is the
  // INVOICE id, never a project id. The create route (/admin/invoices/new) has
  // no params at all.
  const isEdit = Boolean(invoiceId)
  const initialProjectId = searchParams.get('projectId') ?? ''

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  // Fallback rate: applies to employees whose assignment captured no
  // usable billRate. An invoice-level price decision, never a
  // project/assignment mutation.
  const [hourlyRate, setHourlyRate] = useState(0)
  const [variableCosts, setVariableCosts] = useState<VariableCost[]>([{ id: '', amount: 0, reason: '' }])
  // Edit mode only: hours the invoice was created with, and its stored fixed
  // cost (legacy invoices created before project-total billing carry neither).
  const [editBillableHours, setEditBillableHours] = useState<number | null>(null)
  const [editFixedCost, setEditFixedCost] = useState(0)
  // Edit mode only: the invoice's own per-timesheet lines.
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([])
  // Create mode only: the read-only preview of what the invoice would bill.
  const [preview, setPreview] = useState<{
    employees: EmployeeBillingSummary[]
    billableHours: number
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  // Create mode only: the "no approved unbilled hours" state is a real,
  // actionable outcome (everything is pending or already billed) — surfaced
  // as a hint, not an error toast.
  const [previewError, setPreviewError] = useState<string | null>(null)
  // Per-employee rate overrides typed into the table. Keys are resource ids;
  // a missing key means "use the row's default rate". In create mode these
  // are sent with the POST; in edit mode each save PATCHes the row's
  // timesheet ids atomically (PATCH /invoices/:id/rates).
  const [rateValues, setRateValues] = useState<Record<string, number>>({})
  const [savingResourceId, setSavingResourceId] = useState<string | null>(null)

  const project = projects.find((p) => p.id === selectedProjectId) ?? null

  // Create mode: whenever the selected project or the fallback rate
  // changes, ask the backend for the per-employee breakdown this
  // invoice would bill (approved, not-yet-billed timesheets only).
  // The preview is side-effect free — no reservation is written — so
  // an admin can shop per-employee rates before committing. Amounts
  // with typed rates are computed locally below; the server recomputes
  // authoritatively at submit time, so preview and invoice agree.
  useEffect(() => {
    if (isEdit || !selectedProjectId) {
      setPreview(null)
      setPreviewError(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    previewInvoice(selectedProjectId, hourlyRate)
      .then((result) => {
        if (cancelled) return
        setPreview({ employees: result.employees, billableHours: result.billableHours })
      })
      .catch((err) => {
        if (cancelled) return
        const message = failureMessage(err, { what: 'preview the invoice lines', reassurance: 'No changes were saved', next: 'try again' })
        if (/no approved unbilled hours/i.test(message)) {
          setPreviewError(message)
          setPreview(null)
        } else {
          addToast('error', message)
          setPreview(null)
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => { cancelled = true }
  }, [isEdit, selectedProjectId, hourlyRate, addToast])

  // A different project means different employees — drop any typed
  // overrides so no rate leaks across projects. (The fallback-rate
  // change deliberately keeps typed overrides: they are explicit
  // price decisions.)
  useEffect(() => {
    setRateValues({})
  }, [selectedProjectId])

  // Edit mode: load the invoice (its lines carry the per-timesheet
  // traceability and the committed rates).
  useEffect(() => {
    if (!isEdit || !invoiceId) return
    getInvoiceById(invoiceId).then((invoice) => {
      if (invoice) {
        setSelectedProjectId(invoice.projectId)
        setHourlyRate(invoice.hourlyRate)
        setEditBillableHours(invoice.billableHours ?? null)
        setEditFixedCost(invoice.fixedCost)
        setInvoiceLines(invoice.lines ?? [])
        setVariableCosts(
          invoice.variableCosts.length
            ? invoice.variableCosts
            : [{ id: '', amount: 0, reason: '' }],
        )
      }
    })
  }, [isEdit, invoiceId])

  // One row per employee. Create mode: the preview's aggregation.
  // Edit mode: the invoice's lines grouped per resource.
  const employeeRows: EmployeeRow[] = useMemo(() => {
    if (isEdit) return groupLinesByResource(invoiceLines)
    return (preview?.employees ?? []).map((emp) => ({
      resourceId: emp.resourceId,
      resourceName: emp.resourceName,
      hours: emp.hours,
      defaultRate: emp.rate,
      rateSource: emp.rateSource,
      mixedRates: emp.mixedRates,
      timesheetIds: emp.timesheetIds,
    }))
  }, [isEdit, invoiceLines, preview])

  const billableHours = isEdit ? (editBillableHours ?? 0) : (preview?.billableHours ?? 0)

  // Fixed cost is always derived: Σ per-employee (hours × effective
  // rate), rounded per line exactly like the backend. In edit mode
  // with no in-progress edits this equals the stored fixed cost.
  // Legacy invoices (no lines) keep their stored fixed cost —
  // there is nothing to recompute from.
  const fixedCost = useMemo(() => {
    if (isEdit && invoiceLines.length === 0) return editFixedCost
    return round2(
      employeeRows.reduce((sum, row) => {
        const rate = rateValues[row.resourceId] ?? row.defaultRate
        return sum + round2(rate * row.hours)
      }, 0),
    )
  }, [isEdit, invoiceLines.length, editFixedCost, employeeRows, rateValues])

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
      // F-01: the amount input used to carry a native min="0". The form is now
      // noValidate, so the rule lives here — otherwise a negative cost would
      // sail through to the API. (Same shape as the hourlyRate check above.)
      if (vc.amount < 0) {
        newErrors[`vc-${i}-amount`] = 'Amount cannot be negative'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      focusFirstError(e.currentTarget)
      return
    }
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
        // Create flow — one round trip. Only rates the admin actually
        // changed are sent as overrides (resource-keyed); untouched rows
        // keep their captured/default provenance ('assignment'/'invoice').
        // Variable costs ride along in the same request, so the invoice
        // is created complete: fixedCost + variableCostTotal = total.
        const lineRateOverrides: Record<string, number> = {}
        for (const row of employeeRows) {
          const typed = rateValues[row.resourceId]
          if (
            typed !== undefined &&
            Number.isFinite(typed) &&
            typed >= 0 &&
            typed !== row.defaultRate
          ) {
            lineRateOverrides[row.resourceId] = typed
          }
        }
        const costs = variableCosts.filter((vc) => vc.amount > 0 || vc.reason.trim())
        const invoice = await createInvoiceService({
          projectId: selectedProjectId,
          hourlyRate,
          lineRateOverrides,
          ...(costs.length > 0
            ? { variableCosts: costs.map((vc) => ({ amount: vc.amount, reason: vc.reason })) }
            : {}),
        })
        addToast('success', 'Invoice created successfully')
        await refreshInvoices()
        navigate(`/admin/invoices/${invoice.id}`)
      }
    } catch (err) {
      const message = failureMessage(err, { what: 'save that invoice', reassurance: 'Nothing was sent and no changes were saved', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Edit flow — commit one employee's rate. The row expands to that
   * employee's timesheet ids and PATCHes them atomically
   * (PATCH /invoices/:id/rates); the backend re-derives
   * fixedCost = Σ line amounts and total in a single write. On
   * success the invoice's lines (now rateSource 'manual') replace
   * the local state, so the row's displayed rate equals the saved
   * rate and the in-progress value is dropped.
   */
  const handleSaveRowRate = async (row: EmployeeRow) => {
    if (!isEdit || !invoiceId) return
    const rate = rateValues[row.resourceId]
    if (rate === undefined || !Number.isFinite(rate) || rate < 0) {
      setRateValues((prev) => { const next = { ...prev }; delete next[row.resourceId]; return next })
      return
    }
    setSavingResourceId(row.resourceId)
    try {
      const rates: InvoiceRateUpdate[] = row.timesheetIds.map((timesheetId) => ({ timesheetId, rate }))
      const updated = await updateInvoiceRatesService(invoiceId, rates)
      if (updated) {
        setInvoiceLines(updated.lines ?? [])
        setEditBillableHours(updated.billableHours ?? null)
        setEditFixedCost(updated.fixedCost)
        setRateValues((prev) => { const next = { ...prev }; delete next[row.resourceId]; return next })
        addToast('success', 'Employee rate updated')
      }
    } catch (err) {
      const message = failureMessage(err, { what: 'update that employee rate', reassurance: 'No changes were saved', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setSavingResourceId(null)
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
        <Button variant="ghost" to={'/admin/invoices'} leftIcon={<ArrowLeft className="h-4 w-4" />} />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEdit
              ? 'Update rates and variable costs while the invoice is a draft.'
              : 'Pick a project, set a billing rate per employee, add any variable costs — the total updates live.'}
          </p>
        </div>
      </div>

      <form noValidate onSubmit={handleSubmit} className="space-y-6">
        {!isEdit && (
          <Card>
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">Project</h2>
            </div>
            <div className="p-5">
              <div>
                <label htmlFor="invoice-project" className="mb-1 block text-sm font-medium text-foreground">Project</label>
                <select
                  id="invoice-project"
                  value={selectedProjectId}
                  onChange={(e) => {
                    const value = e.target.value
                    setSelectedProjectId(value)
                    // Auto-pick the project's default rate in the
                    // same event so the preview below fires once,
                    // with the correct fallback rate.
                    const next = projects.find((p) => p.id === value)
                    setHourlyRate(next?.hourlyRate ?? 0)
                  }}
                  aria-invalid={Boolean(errors.projectId)}
                  aria-describedby={errors.projectId ? 'invoice-project-error' : undefined}
                  className="w-full appearance-none rounded-full border border-border bg-muted px-3 h-9 text-base sm:text-sm text-foreground focus:outline-none focus:border-ring"
                >
                  <option value="">Select a project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {errors.projectId && <p id="invoice-project-error" role="alert" className="mt-1 text-sm text-destructive">{errors.projectId}</p>}
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
              <span className="text-sm text-muted-foreground">Default Rate ($/h)</span>
              <Input
                type="number"
                inputMode="decimal"
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
            <p className="text-xs text-muted-foreground">
              The default rate applies to employees whose assignment captured no rate. Each employee's rate can be overridden in the table below.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fixed Cost (Σ employee amounts)</span>
              <span className="text-sm font-semibold text-foreground">${fixedCost.toFixed(2)}</span>
            </div>
            {!selectedProjectId && !isEdit && (
              <p className="text-sm text-muted-foreground">Pick a project — its approved, unbilled hours and per-employee breakdown fill in automatically.</p>
            )}
            {isEdit && editBillableHours == null && (
              <p className="text-sm text-muted-foreground">Legacy invoice: it predates per-employee billing, so only variable costs can be changed.</p>
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

        {/* Per-employee breakdown. In edit mode the rows come from the
            invoice itself (PATCH /:id/rates commits each employee's
            override atomically). In create mode the rows come from a
            read-only preview of the approved-only collector
            (GET /invoices/preview); typed rates are held in
            `rateValues`, amounts recompute locally, and the overrides
            are committed at submit time via
            `createInvoice({ lineRateOverrides })`. Either way the
            summary above always reflects the live total. Empty for
            legacy/flag-off invoices, which keep their old layout. */}
        {(isEdit || (!isEdit && (employeeRows.length > 0 || previewLoading || previewError))) && (
          <Card>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">Employees on This Invoice</h2>
              <span className="text-sm text-muted-foreground">
                {isEdit
                  ? 'Rates are editable while the invoice is a draft.'
                  : 'Rates are editable before the invoice is created.'}
              </span>
            </div>
            {!isEdit && previewLoading && (
              <div className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
                Loading billable hours…
              </div>
            )}
            {!isEdit && previewError && (
              <div className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
                {previewError}
              </div>
            )}
            {employeeRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hours</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rate ($/h)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {employeeRows.map((row) => {
                      const typed = rateValues[row.resourceId]
                      const displayRate = typed ?? row.defaultRate
                      const amount = round2(displayRate * row.hours)
                      const isEditing = typed !== undefined
                      return (
                        <tr key={row.resourceId} className="hover:bg-muted">
                          <td className="px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{row.resourceName}</span>
                              <span className="text-xs text-muted-foreground">
                                {row.timesheetIds.length === 1
                                  ? '1 timesheet'
                                  : `${row.timesheetIds.length} timesheets`}
                                {row.rateSource === 'manual' ? ' · rate overridden' : ''}
                                {row.mixedRates && !isEditing
                                  ? ' · captured rates vary by week'
                                  : ''}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-foreground">{row.hours.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={displayRate}
                                disabled={savingResourceId === row.resourceId || (isEdit && editBillableHours == null)}
                                aria-label={`Billing rate for ${row.resourceName}`}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value)
                                  setRateValues((prev) => ({
                                    ...prev,
                                    [row.resourceId]: Number.isFinite(value) ? value : 0,
                                  }))
                                }}
                                onBlur={() => (isEdit ? handleSaveRowRate(row) : undefined)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (isEdit) handleSaveRowRate(row)
                                  }
                                  if (e.key === 'Escape') {
                                    setRateValues((prev) => {
                                      const next = { ...prev }
                                      delete next[row.resourceId]
                                      return next
                                    })
                                  }
                                }}
                                className="w-28 text-right"
                              />
                              {isEdit && isEditing && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  loading={savingResourceId === row.resourceId}
                                  onClick={() => handleSaveRowRate(row)}
                                  leftIcon={<Pencil className="h-3 w-3" />}
                                >
                                  Save
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-foreground">${amount.toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-muted">
                    <tr>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">Subtotal</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">{employeeRows.reduce((s, r) => s + r.hours, 0).toFixed(2)}</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">${fixedCost.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        )}

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
                          inputMode="decimal"
                          step="0.01"
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
            <Button variant="secondary" to={'/admin/invoices'}>Cancel</Button>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting || previewLoading} leftIcon={<Save className="h-4 w-4" />}>
              {isEdit ? 'Save Changes' : 'Create Invoice'}
            </Button>
          </div>
      </form>
    </div>
  )
}
