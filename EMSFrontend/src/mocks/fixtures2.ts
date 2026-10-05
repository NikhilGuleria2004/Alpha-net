import type { Assignment } from '../types/assignment'
import type { PayrollRow, PayRateChange } from '../types/payroll'
import type { EmsNotification } from '../types/notification'
import type { Activity } from '../types/activity'
import type { EmsDocument } from '../types/document'
import { MOCK_TODAY, MOCK_USERS } from './fixtures'

const NOW = '2026-09-30T08:15:00.000Z'

export const MOCK_ASSIGNMENTS: Assignment[] = [
  { id: 'a-1', userId: 'u-emp1', projectId: 'p-portal', clientId: 'c-acme', billRate: 140, payRate: 85, currency: 'USD', ftePercent: 80, roleOnProject: 'Frontend Engineer', startDate: '2026-07-01', endDate: '2026-12-31', status: 'active', timesheetEnabled: true, createdAt: '2026-07-01T09:00:00.000Z', updatedAt: NOW },
  { id: 'a-2', userId: 'u-emp2', projectId: 'p-portal', clientId: 'c-acme', billRate: 150, payRate: 95, currency: 'USD', ftePercent: 50, roleOnProject: 'Backend Engineer', startDate: '2026-08-01', endDate: '2026-12-31', status: 'active', timesheetEnabled: true, createdAt: '2026-08-01T09:00:00.000Z', updatedAt: NOW },
]

export const MOCK_PAYROLL: PayrollRow[] = MOCK_USERS.filter((u) => u.status === 'active' && u.role !== 'admin').map((u, i) => {
  const hours = u.billable ? 160 - i * 4 : 168
  const rate = u.payRate ?? 0
  return {
    id: `pr-${u.id}`,
    userId: u.id,
    employeeName: u.name,
    role: u.role,
    billable: u.billable,
    period: '2026-09',
    hours,
    payRate: rate,
    currency: u.currency ?? 'USD',
    gross: rate * hours,
    status: 'draft',
  }
})

export const MOCK_RATE_CHANGES: PayRateChange[] = [
  { id: 'rc-1', userId: 'u-emp1', changedBy: 'Hina Rao', oldRate: 80, newRate: 85, currency: 'USD', reason: 'Annual revision', createdAt: '2026-04-01T09:00:00.000Z' },
]

export const MOCK_NOTIFICATIONS: EmsNotification[] = [
  { id: 'n-1', userId: 'u-hr', type: 'attendance', title: '2 people unmarked', message: 'Dev Contractor and 1 more have not marked attendance today.', read: false, createdAt: NOW, relatedId: 'u-emp2' },
  { id: 'n-2', userId: 'u-hr', type: 'onboarding', title: 'Docs pending', message: 'Riya Sharma uploaded her ID proof — verification pending.', read: false, createdAt: NOW, relatedId: 'ob-3' },
  { id: 'n-3', userId: 'u-hr', type: 'payrate', title: 'Rate change approved', message: 'Esha Employee: $80 → $85/hr effective Apr 1.', read: true, createdAt: NOW, relatedId: 'u-emp1' },
]

export const MOCK_ACTIVITY: Activity[] = [
  { id: 'ac-1', kind: 'client', actorId: 'u-manager', actorName: 'Meera Manager', description: 'Created client Initech LLC (CL-2026-003)', relatedId: 'c-initech', createdAt: NOW },
  { id: 'ac-2', kind: 'assignment', actorId: 'u-manager', actorName: 'Meera Manager', description: 'Assigned Dev Contractor to Acme Portal Revamp @ 50% FTE', relatedId: 'a-2', createdAt: NOW },
  { id: 'ac-3', kind: 'payrate', actorId: 'u-hr', actorName: 'Hina Rao', description: 'Updated pay rate for Esha Employee: $80 → $85/hr', relatedId: 'u-emp1', createdAt: NOW },
  { id: 'ac-4', kind: 'attendance', actorId: 'system', actorName: 'System', description: `Attendance freeze ran for 2026-09-29 — 6 present, 1 absent`, createdAt: NOW },
]

export const MOCK_DOCUMENTS: EmsDocument[] = [
  { id: 'd-1', userId: 'u-emp1', kind: 'contract', name: 'Offer letter — Esha.pdf', size: 184320, mimeType: 'application/pdf', storageKey: 'docs/u-emp1/offer.pdf', status: 'verified', uploadedBy: 'Hina Rao', createdAt: '2026-01-06T09:00:00.000Z' },
  { id: 'd-2', userId: 'u-emp2', kind: 'id_proof', name: 'Passport — Dev.pdf', size: 412672, mimeType: 'application/pdf', storageKey: 'docs/u-emp2/passport.pdf', status: 'pending', uploadedBy: 'Hina Rao', createdAt: '2026-09-20T09:00:00.000Z' },
]

export const MOCK_ATTENDANCE_TREND = [94, 96, 92, 97, 95, 98, 96, 93, 97, 96, 95, 98]
export const MOCK_UTILIZATION_TREND = [72, 75, 78, 74, 80, 82, 79, 84, 81, 83, 85, 82]

void MOCK_TODAY
