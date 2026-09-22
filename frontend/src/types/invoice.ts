export type InvoiceStatus = 'draft' | 'sent'

export interface VariableCost {
  id: string
  amount: number
  reason: string
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
}

export interface CreateInvoiceInput {
  projectId: string
  hourlyRate?: number
}

export interface UpdateInvoiceInput {
  hourlyRate?: number
  addVariableCosts?: { amount: number; reason: string }[]
  removeVariableCostIds?: string[]
}
