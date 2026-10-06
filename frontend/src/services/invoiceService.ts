import type { Invoice, InvoiceLine, EmployeeBillingSummary, CreateInvoiceInput, UpdateInvoiceInput, InvoiceRateUpdate } from '../types/invoice'
import apiClient from './apiClient'

export async function getInvoices(): Promise<Invoice[]> {
  const response = await apiClient.get<{ invoices: Invoice[] }>('/invoices')
  return response.invoices
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  const response = await apiClient.get<{ invoice: Invoice }>(`/invoices/${id}`)
  return response.invoice
}

export async function getInvoicesByProjectId(projectId: string): Promise<Invoice[]> {
  const response = await apiClient.get<{ invoices: Invoice[] }>(`/invoices?projectId=${projectId}`)
  return response.invoices
}

export async function createInvoice(data: CreateInvoiceInput): Promise<Invoice> {
  const response = await apiClient.post<{ invoice: Invoice }>('/invoices', data)
  return response.invoice
}

export async function updateInvoice(id: string, data: UpdateInvoiceInput): Promise<Invoice | undefined> {
  const response = await apiClient.patch<{ invoice: Invoice }>(`/invoices/${id}`, data)
  return response.invoice
}

export async function sendInvoice(id: string, to?: string): Promise<Invoice | undefined> {
  const response = await apiClient.post<{ invoice: Invoice }>(`/invoices/${id}/send`, to ? { to } : {})
  return response.invoice
}

/**
 * Flow Integration Phase 5 — GET /invoices/preview?projectId=&hourlyRate=&lineRateOverrides=
 *
 * Read-only preview of the per-employee breakdown the create flow would
 * bill: the per-timesheet lines, the per-employee aggregation the UI
 * renders, and the totals. Reuses the approved-only collector, so the
 * lines, hours, rates, and amounts returned here are exactly what
 * `createInvoice` would persist. Side-effect free: no reservation is
 * written, so an admin can shop per-employee rates before committing.
 *
 * `lineRateOverrides` is keyed by RESOURCE id (employee) — the same
 * shape createInvoice accepts — so the preview reflects the rates the
 * admin is typing.
 */
export async function previewInvoice(
  projectId: string,
  hourlyRate: number,
  lineRateOverrides?: Record<string, number>,
): Promise<{
  lines: InvoiceLine[]
  employees: EmployeeBillingSummary[]
  billableHours: number
  fixedCost: number
  billedTimesheetIds: string[]
}> {
  const params = new URLSearchParams({ projectId, hourlyRate: String(hourlyRate) })
  if (lineRateOverrides && Object.keys(lineRateOverrides).length > 0) {
    params.set('lineRateOverrides', JSON.stringify(lineRateOverrides))
  }
  const response = await apiClient.get<{
    lines: InvoiceLine[]
    employees: EmployeeBillingSummary[]
    billableHours: number
    fixedCost: number
    billedTimesheetIds: string[]
  }>(`/invoices/preview?${params.toString()}`)
  return response
}

/**
 * Flow Integration Phase 5 — PATCH /invoices/:id/rates (admin).
 *
 * Atomically updates the rate on several lines of a draft invoice
 * (the edit UI sends one row per employee, expanded to that
 * employee's timesheet ids) and the backend re-derives
 * fixedCost = Σ line amounts plus total in a single write. The
 * underlying assignment/timesheet records are never touched —
 * this is an invoice-level price decision.
 */
export async function updateInvoiceRates(
  invoiceId: string,
  rates: InvoiceRateUpdate[],
): Promise<Invoice | undefined> {
  const response = await apiClient.patch<{ invoice: Invoice }>(
    `/invoices/${invoiceId}/rates`,
    { rates },
  )
  return response.invoice
}

/**
 * Flow Integration Phase 5 — PATCH /invoices/:id/lines/:timesheetId/rate (admin).
 *
 * Overrides the rate on a single per-employee line of a draft invoice and
 * recomputes that line's amount plus the invoice's fixed cost + total. The
 * underlying assignment/timesheet records are never touched — this is an
 * invoice-level price decision, exactly like the top-level `hourlyRate`.
 */
export async function updateLineRate(
  invoiceId: string,
  timesheetId: string,
  rate: number,
): Promise<Invoice | undefined> {
  const response = await apiClient.patch<{ invoice: Invoice }>(
    `/invoices/${invoiceId}/lines/${timesheetId}/rate`,
    { rate },
  )
  return response.invoice
}
