import type { EmsDocument, DocumentKind } from './document'
import type { EmsUser } from './auth'
import type { SupportedCurrencyCode } from './auth'

export type OnboardingStage = 'invited' | 'docs_pending' | 'payrate_pending' | 'ready' | 'active'

export interface OnboardingCandidate {
  id: string
  name: string
  email: string
  employeeId: string
  department?: string
  role?: EmsUser['role']
  stage: OnboardingStage
  invitedAt?: string
  startedAt?: string
  invitedBy?: string
  documentsUploaded: number
  documentsTotal: number
  payRate?: number | null
  currency?: SupportedCurrencyCode
  /** Set when the invite was withdrawn (soft-delete). Re-inviting the email is allowed. */
  deletedAt?: string
  deletedBy?: string
}

export interface OnboardingPipeline {
  invited: number
  docsPending: number
  payratePending: number
  ready: number
  active: number
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type LeaveType = 'vacation' | 'sick' | 'personal' | 'unpaid' | 'maternity' | 'paternity'

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

export type DocumentUploadStatus = 'uploading' | 'uploaded' | 'verified' | 'rejected'

export interface DocumentUpload {
  id: string
  userId: string
  name: string
  kind: DocumentKind
  size: number
  mimeType: string
  status: DocumentUploadStatus
  uploadedAt: string
  verifiedBy?: string
  verifiedAt?: string
  notes?: string
  url?: string
}

export type PayRateHistoryEntry = {
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

export type { EmsUser }
export type { EmsDocument }
