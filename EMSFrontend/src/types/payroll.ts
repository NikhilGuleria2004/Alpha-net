import type { SupportedCurrencyCode } from './auth'

/**
 * Payroll domain (EMSFrontend.md §7.8).
 *
 * Read-oriented: calculation stays backend-side. The shell renders per-period
 * rows plus the rate-change audit log.
 */

export type PayrollRowStatus = 'draft' | 'approved' | 'paid'

export interface PayrollRow {
  id: string
  userId: string
  employeeName: string
  role: string
  billable: boolean
  /** Pay-period key, e.g. `2026-09`. */
  period: string
  hours: number
  payRate: number
  currency: SupportedCurrencyCode
  gross: number
  status: PayrollRowStatus
}

export interface PayRateChange {
  id: string
  userId: string
  changedBy: string
  oldRate: number | null
  newRate: number
  currency: SupportedCurrencyCode
  reason?: string
  createdAt: string
}
