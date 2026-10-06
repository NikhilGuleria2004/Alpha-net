export type InvoiceStatus = 'draft' | 'sent'

export interface VariableCost {
  id: string
  amount: number
  reason: string
}

export interface InvoiceLine {
  timesheetId: string
  assignmentId?: string
  resourceId?: string
  resourceName?: string
  weekStart: string
  hours: number
  rate: number
  amount: number
  rateSource: 'assignment' | 'invoice' | 'manual'
  source: 'approved' | 'proportional'
}

/**
 * Flow Integration Phase 5 create/edit flow: the invoice's lines
 * aggregated per employee — one UI row per resource. Mirrors the
 * backend's `EmployeeBillingSummary` exactly (the preview endpoint
 * and createInvoice both derive it from the same collector, so the
 * UI and the persisted invoice can never disagree).
 */
export interface EmployeeBillingSummary {
  resourceId: string
  resourceName: string
  /** Summed billable (regular Mon–Fri) hours across the employee's lines. */
  hours: number
  /**
   * Effective rate: the override when applied, otherwise the
   * employee's captured rate (or the invoice rate). When
   * `mixedRates` is true this is the first line's rate.
   */
  rate: number
  /** Sum of the employee's line amounts. */
  amount: number
  rateSource: 'assignment' | 'invoice' | 'manual'
  /** True when the employee's lines carry different captured rates. */
  mixedRates: boolean
  /** The timesheet ids behind the row. */
  timesheetIds: string[]
}

export interface Invoice {
  id: string
  invoiceNumber: string
  projectId: string
  projectName: string
  weekStart: string
  weekEnd: string
  periodLabel: string
  hourlyRate: number
  billableHours?: number
  fixedCost: number
  variableCosts: VariableCost[]
  variableCostTotal: number
  total: number
  status: InvoiceStatus
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  sentAt?: string
  pdfPath?: string
  /** Per-timesheet traceability; empty on legacy invoices and on flag-off invoices. */
  lines?: InvoiceLine[]
  /** The timesheets this invoice reserved — the double-bill guard reads these. */
  billedTimesheetIds?: string[]
  /** True ⇒ lines/billedTimesheetIds came from the approved-only path. */
  approvedOnly?: boolean
  /** Billing scope the caller asked for (approved-only path). */
  assignmentId?: string
  paidAt?: string
  voidedAt?: string
  voidReason?: string
}

export interface CreateInvoiceInput {
  projectId: string
  hourlyRate?: number
  /**
   * Flow Integration Phase 5 create flow: per-EMPLOYEE rate
   * overrides typed into the new-invoice UI. Keys are resource
   * ids (users._id); the backend expands each across the
   * employee's billable timesheets and stores the lines as
   * `rateSource: 'manual'` — an invoice-level price decision,
   * never an assignment/timesheet mutation. Empty/undefined ⇒
   * no overrides.
   */
  lineRateOverrides?: Record<string, number>
  /** Variable costs added in the same request (one round trip). */
  variableCosts?: { amount: number; reason: string }[]
}

/** One line-rate entry for the atomic PATCH /invoices/:id/rates. */
export interface InvoiceRateUpdate {
  timesheetId: string
  rate: number
}

export interface UpdateInvoiceInput {
  hourlyRate?: number
  addVariableCosts?: { amount: number; reason: string }[]
  removeVariableCostIds?: string[]
}
