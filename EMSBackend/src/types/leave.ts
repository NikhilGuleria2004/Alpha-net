/**
 * Leave domain types (EMSBackend §5.2, §7.5).
 * Mirrors EMSFrontend/src/types/hr.ts field-for-field.
 */

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/**
 * The six canonical values. EMSBackend §5.2 originally listed only four
 * (sick/casual/earned/unpaid); the frontend contract wins for shape
 * (EMSBackend non-negotiable rule 3), so the seed is these six.
 */
export type LeaveType = 'vacation' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'paternity'

export interface LeaveTypeOption {
  value: LeaveType
  label: string
}

export interface LeaveRequest {
  id: string
  userId: string
  employeeName: string
  type: LeaveType
  startDate: string
  endDate: string
  days: number
  status: LeaveStatus
  reason?: string
  submittedAt?: string
  reviewedBy?: string
  reviewedAt?: string
  note?: string
}

export interface CreateLeaveInput {
  type: LeaveType
  startDate: string
  endDate: string
  reason?: string
  note?: string
}

export interface ReviewLeaveInput {
  status: Extract<LeaveStatus, 'approved' | 'rejected' | 'cancelled'>
  note?: string
}