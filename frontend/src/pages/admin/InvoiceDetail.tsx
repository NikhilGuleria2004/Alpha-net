import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, Send, FileDown, Trash2, Pencil } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Card } from '../../components/ui/Card'
import { KpiChip } from '../../components/ui/KpiChip'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Input } from '../../components/ui/Input'
import { getInvoiceById as getInvoiceService, sendInvoice as sendInvoiceService, updateInvoice as updateInvoiceService, updateLineRate as updateLineRateService } from '../../services/invoiceService'
import type { Invoice, VariableCost } from '../../types/invoice'
import { failureMessage } from '../../utils/errorMessage'
import { formatDate } from '../../utils/date'

export function InvoiceDetail() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { invoices, refreshInvoices } = useAppData()
  const { addToast } = useToast()

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [showSendForm, setShowSendForm] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null)
  // Flow Integration Phase 5 — per-employee rate override on a draft invoice.
  // `editingRate[timesheetId]` holds the in-progress input value for one line;
  // the row only commits on blur/Enter via handleSaveLineRate.
  const [editingRate, setEditingRate] = useState<Record<string, number>>({})
  const [savingLineId, setSavingLineId] = useState<string | null>(null)

  useEffect(() => {
    if (!invoiceId) return
    const load = async () => {
      const existing = invoices.find((i) => i.id === invoiceId)
      if (existing) {
        setInvoice(existing)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      const data = await getInvoiceService(invoiceId)
      setInvoice(data ?? null)
      setIsLoading(false)
    }
    load()
  }, [invoiceId, invoices])

  const handleSend = async () => {
    if (!invoiceId) return
    setIsSending(true)
    try {
      const trimmed = recipientEmail.trim()
      const sent = await sendInvoiceService(invoiceId, trimmed || undefined)
      if (sent) {
        setInvoice(sent)
        setShowSendForm(false)
        setRecipientEmail('')
        await refreshInvoices()
        addToast('success', trimmed ? `Invoice sent to ${trimmed}` : 'Invoice sent successfully')
      }
    } catch (err) {
      const message = failureMessage(err, { what: 'send that invoice', reassurance: 'It is still a draft — nothing was sent', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setIsSending(false)
    }
  }

  const handleRemoveVariableCost = async (costId: string) => {
    if (!invoiceId || !invoice) return
    try {
      const updated = await updateInvoiceService(invoiceId, { removeVariableCostIds: [costId] })
      if (updated) {
        setInvoice(updated)
        setShowRemoveConfirm(null)
        addToast('success', 'Variable cost removed')
      }
    } catch (err) {
      const message = failureMessage(err, { what: 'remove that cost', reassurance: 'The cost is still on the invoice', next: 'try again' })
      addToast('error', message)
    }
  }

  const handleDownloadPDF = async () => {
    if (!invoice) return
    try {
      const { downloadBlob } = await import('../../services/apiClient')
      const { blob, filename } = await downloadBlob(`/invoices/${invoice.id}/pdf`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename ?? `invoice-${invoice.invoiceNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      addToast('success', 'PDF downloaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed'
      addToast('error', message)
    }
  }

  /**
   * Flow Integration Phase 5 — per-employee rate override. PATCHes one line of
   * the draft invoice, re-fetches the invoice, and rolls the input back to the
   * committed value on success (or clears it on failure). The row's rate is the
   * assignment's billRate by default (rateSource 'assignment') or the invoice
   * rate ('invoice'); an admin override becomes 'manual'. Changing one rate
   * re-derives fixedCost = sum(lines.amount) and total, so the summary card
   * below always reflects it.
   */
  const handleSaveLineRate = async (timesheetId: string) => {
    if (!invoice || !invoiceId) return
    const rate = editingRate[timesheetId]
    if (rate === undefined || !Number.isFinite(rate) || rate < 0) {
      setEditingRate((prev) => { const next = { ...prev }; delete next[timesheetId]; return next })
      return
    }
    setSavingLineId(timesheetId)
    try {
      const updated = await updateLineRateService(invoiceId, timesheetId, rate)
      if (updated) {
        setInvoice(updated)
        setEditingRate((prev) => { const next = { ...prev }; delete next[timesheetId]; return next })
        addToast('success', 'Employee rate updated')
      }
    } catch (err) {
      const message = failureMessage(err, { what: 'update that employee rate', reassurance: 'No changes were saved', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setSavingLineId(null)
    }
  }

  if (isLoading || !invoice) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  const variableCostTotal = invoice.variableCosts.reduce((sum, vc) => sum + vc.amount, 0)
  const canEdit = invoice.status === 'draft'

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" to={'/admin/invoices'} leftIcon={<ArrowLeft className="h-4 w-4" />} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Invoice {invoice.invoiceNumber}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{invoice.projectName} · {invoice.periodLabel}</p>
          </div>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Summary</h2>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Period</span>
            <span className="text-sm font-medium text-foreground">{invoice.weekStart} – {invoice.weekEnd}</span>
          </div>
          {invoice.billableHours != null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Billable Hours</span>
              <KpiChip label="Hours" value={invoice.billableHours.toFixed(2)} color="info" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Hourly Rate</span>
            <span className="text-sm font-medium text-foreground">${invoice.hourlyRate.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Fixed Cost</span>
            <span className="text-sm font-medium text-foreground">${invoice.fixedCost.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Variable Costs</span>
            <KpiChip label="Var" value={variableCostTotal.toFixed(2)} />
          </div>
          <hr className="border-border" />
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">Total</span>
            <span className="text-xl font-bold text-foreground">${invoice.total.toFixed(2)}</span>
          </div>
          {invoice.sentAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Sent At</span>
              <span className="text-sm font-medium text-foreground">{formatDate(invoice.sentAt)}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Flow Integration Phase 5 — per-employee breakdown. The approved-only
          collector already emits one line per billed timesheet (resourceName,
          hours, rate, amount), so this is display + editable rate only; the
          underlying assignment/timesheet records are never touched. Empty for
          legacy invoices and flag-off invoices, which keep their old layout. */}
      {invoice.lines && invoice.lines.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Employees on This Invoice</h2>
            <span className="text-sm text-muted-foreground">{invoice.lines.length} {invoice.lines.length === 1 ? 'line' : 'lines'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Week</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hours</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rate ($/h)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.lines.map((line) => {
                  const isEditing = editingRate[line.timesheetId] !== undefined
                  const displayRate = isEditing ? editingRate[line.timesheetId] : line.rate
                  return (
                    <tr key={line.timesheetId} className="hover:bg-muted">
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{line.resourceName ?? 'Unknown resource'}</span>
                          {line.rateSource === 'manual' && (
                            <span className="text-xs text-muted-foreground">rate overridden</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{line.weekStart}</td>
                      <td className="px-4 py-3 text-right text-sm text-foreground">{line.hours.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              value={displayRate}
                              disabled={savingLineId === line.timesheetId}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value)
                                setEditingRate((prev) => ({ ...prev, [line.timesheetId]: Number.isFinite(value) ? value : 0 }))
                              }}
                              onBlur={() => handleSaveLineRate(line.timesheetId)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleSaveLineRate(line.timesheetId)
                                }
                                if (e.key === 'Escape') {
                                  setEditingRate((prev) => { const next = { ...prev }; delete next[line.timesheetId]; return next })
                                }
                              }}
                              className="w-28 text-right"
                            />
                            {isEditing && (
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={savingLineId === line.timesheetId}
                                onClick={() => handleSaveLineRate(line.timesheetId)}
                                leftIcon={<Pencil className="h-3 w-3" />}
                              >
                                Save
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="block text-right text-sm text-foreground">${line.rate.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-foreground">${line.amount.toFixed(2)}</td>
</tr>
                  )}
                )}
                </tbody>
                <tfoot className="bg-muted">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-right text-sm font-semibold text-foreground">Subtotal (lines)</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">{invoice.lines.reduce((s, l) => s + l.hours, 0).toFixed(2)}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">${invoice.lines.reduce((s, l) => s + l.amount, 0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
      )}

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Variable Costs</h2>
        </div>
        <div className="p-5">
          {invoice.variableCosts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No variable costs added.</p>
          ) : (
            <div className="space-y-2">
              {invoice.variableCosts.map((vc: VariableCost) => (
                <div key={vc.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{vc.reason}</span>
                      <span className="text-sm text-muted-foreground">${vc.amount.toFixed(2)}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowRemoveConfirm(vc.id)}
                      leftIcon={<Trash2 className="h-4 w-4 text-destructive" />}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {canEdit && (
          <Button
            variant="secondary"
            to={`/admin/invoices/${invoice.id}/form`}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Edit Costs
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={handleDownloadPDF}
          leftIcon={<FileDown className="h-4 w-4" />}
        >
          Download PDF
        </Button>
        {invoice.status === 'draft' && !showSendForm && (
          <Button onClick={() => setShowSendForm(true)} leftIcon={<Send className="h-4 w-4" />}>
            Send Invoice
          </Button>
        )}
      </div>

      {invoice.status === 'draft' && showSendForm && (
        <Card>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="invoice-recipient-email" className="mb-1 block text-sm font-medium text-foreground">
                Client email (optional)
              </label>
              <input
                id="invoice-recipient-email"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full rounded-lg border border-border px-3 py-2 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The invoice PDF is emailed to this address. Leave blank to just mark it sent.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setShowSendForm(false); setRecipientEmail('') }}>
                Cancel
              </Button>
              <Button onClick={handleSend} loading={isSending} leftIcon={<Send className="h-4 w-4" />}>
                Confirm Send
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={!!showRemoveConfirm}
        title="Remove Variable Cost"
        message="Are you sure you want to remove this variable cost?"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { if (showRemoveConfirm) handleRemoveVariableCost(showRemoveConfirm) }}
        onCancel={() => setShowRemoveConfirm(null)}
      />
    </div>
  )
}
