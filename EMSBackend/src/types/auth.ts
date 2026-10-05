/**
 * EMS roles. The timesheet platform also has a "supervisor" notion, but it is
 * project-scoped (supervise projects and their timesheets) rather than
 * people-scoped, so EMS does not model it. See D-21.
 */
export type UserRole = 'admin' | 'hr' | 'manager' | 'employee'

export type UserStatus = 'active' | 'inactive' | 'invited' | 'on_leave'

export type SupportedCurrencyCode = 'USD' | 'INR' | 'EUR' | 'GBP'

export interface EmsUser {
  id: string
  name: string
  email: string
  role: UserRole
  employeeId: string
  department?: string
  title?: string
  status: UserStatus
  billable: boolean
  payRate?: number | null
  currency?: SupportedCurrencyCode
  employmentType?: 'full_time' | 'part_time' | 'contract'
  managerId?: string
  /**
   * Reporting line on the shared platform record. Not an EMS role and never
   * read for authorization — EMS scoping uses `managerId`. Platform-owned:
   * never write it as a privilege flag. See D-21.
   */
  supervisorId?: string
  avatarUrl?: string
  joinedAt?: string
  createdAt?: string
  updatedAt?: string
}
