import type { SupportedCurrencyCode } from './auth'

/**
 * Assignments domain (EMSFrontend.md §7.7).
 *
 * The link between a billable resource and a project. Creating one connects
 * the employee to the timesheet platform (`timesheetEnabled`); `marginPercent`
 * is derived `(billRate - payRate) / billRate` and shown to managers only.
 */

export type AssignmentStatus = 'proposed' | 'active' | 'ending_soon' | 'ended'

export interface Assignment {
  id: string
  userId: string
  projectId: string
  clientId: string
  billRate: number
  payRate: number
  currency: SupportedCurrencyCode
  /** 0–100. */
  ftePercent: number
  roleOnProject?: string
  startDate: string
  endDate: string
  status: AssignmentStatus
  timesheetEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAssignmentInput {
  userId: string
  projectId: string
  billRate: number
  payRate?: number
  currency?: SupportedCurrencyCode
  ftePercent?: number
  roleOnProject?: string
  startDate: string
  endDate: string
}

/** Margin as a fraction (0–1); callers format with `formatPercent`. */
export function assignmentMargin(assignment: Pick<Assignment, 'billRate' | 'payRate'>): number | null {
  if (assignment.billRate <= 0) return null
  return (assignment.billRate - assignment.payRate) / assignment.billRate
}
