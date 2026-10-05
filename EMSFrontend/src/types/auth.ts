/**
 * EMS auth & user model (EMSFrontend.md §6.1).
 *
 * The EMS introduces four first-class roles. This is additive to the timesheet
 * platform's `admin | user` model — the shared database keeps both readable
 * while the EMS surfaces the richer role set.
 *
 * The timesheet platform also has a "supervisor" notion, but it is
 * project-scoped (supervise projects and their timesheets) rather than
 * people-scoped, so EMS does not model it. See D-21.
 */

export type UserRole = 'admin' | 'hr' | 'manager' | 'employee'

export type UserStatus = 'active' | 'inactive' | 'invited' | 'on_leave'

export type EmploymentType = 'full_time' | 'part_time' | 'contract'

export type SupportedCurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP'

export interface EmsUser {
  id: string
  name: string
  email: string
  role: UserRole
  /** e.g. `E000123` — the resource master identifier. */
  employeeId: string
  department?: string
  title?: string
  status: UserStatus
  /** True only for billable resources. */
  billable: boolean
  /** Hourly pay rate — set during onboarding for billable users. */
  payRate?: number | null
  currency?: SupportedCurrencyCode
  employmentType?: EmploymentType
  managerId?: string
  /**
   * Reporting line on the shared platform record. Not an EMS role and not read
   * for authorization — EMS scoping uses `managerId`. Never written as a
   * privilege flag; see D-21.
   */
  supervisorId?: string
  avatarUrl?: string
  /** ISO date the employee started. */
  joinedAt?: string
  createdAt?: string
  updatedAt?: string
}
