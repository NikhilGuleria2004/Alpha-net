import type { SupportedCurrencyCode, UserRole } from './auth.js'

export type OnboardingStage = 'invited' | 'docs_pending' | 'payrate_pending' | 'ready' | 'active'

export interface OnboardingCandidate {
  id: string
  name: string
  email: string
  employeeId: string
  department?: string
  role?: UserRole
  stage: OnboardingStage
  invitedAt?: string
  startedAt?: string
  invitedBy?: string
  documentsUploaded: number
  documentsTotal: number
  payRate?: number | null
  currency?: SupportedCurrencyCode
}

export interface OnboardingPipeline {
  invited: number
  docsPending: number
  payratePending: number
  ready: number
  active: number
}

export interface CreateOnboardingInput {
  name: string
  email: string
  employeeId: string
  department: string
  role: UserRole
  billable?: boolean
  payRate?: number
  currency?: SupportedCurrencyCode
}

export interface CreateEmployeeInput {
  name: string
  email: string
  employeeId: string
  department: string
  role: Exclude<UserRole, 'admin'> | 'admin'
  title?: string
  employmentType?: 'full_time' | 'part_time' | 'contract'
  billable?: boolean
  payRate?: number
  currency?: SupportedCurrencyCode
  managerId?: string
  supervisorId?: string
  startDate?: string
}

export type UpdateEmployeeInput = Partial<Omit<CreateEmployeeInput, 'email'>> & {
  status?: string
}

export interface PayRateHistoryEntry {
  id: string
  userId: string
  employeeName: string
  employeeId: string
  oldRate: number | null
  newRate: number
  currency: SupportedCurrencyCode
  reason?: string
  changedBy: string
  createdAt: string
}
