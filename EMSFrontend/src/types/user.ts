import type { EmploymentType, SupportedCurrencyCode, UserRole, UserStatus } from './auth'

/**
 * EMS user record (EMSFrontend.md §6.1, §7.5).
 *
 * `EmsUser` itself lives in `types/auth.ts` (the auth model); this module owns
 * the write shapes. `department` is required on create — every employee belongs
 * to a department — while the read model keeps it optional for legacy rows
 * that predate the EMS.
 */

export type { EmploymentType, SupportedCurrencyCode, UserRole, UserStatus }

export interface CreateUserInput {
  name: string
  email: string
  employeeId: string
  department: string
  role: Exclude<UserRole, 'admin'> | 'admin'
  title?: string
  employmentType?: EmploymentType
  billable?: boolean
  payRate?: number
  currency?: SupportedCurrencyCode
  managerId?: string
  supervisorId?: string
  startDate?: string
}

/** PATCH /employees/:id — partial update; only the keys present are written. */
export type UpdateUserInput = Partial<Omit<CreateUserInput, 'email'>> & { status?: UserStatus }
