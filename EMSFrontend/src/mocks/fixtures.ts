import type { EmsUser, EmploymentType } from '../types/auth'
import type { AttendanceRecord } from '../types/attendance'
import type { Client } from '../types/client'
import type { Project } from '../types/project'
import type { EmsDocument } from '../types/document'
import type { HoursByProject, HoursByEmployee, OvertimeStats, TimesheetStatusBreakdown } from '../types/report'

export const NOW = '2026-09-30T08:15:00.000Z'
export const MOCK_TODAY = '2026-09-30'

function baseUser(overrides: Partial<EmsUser> & { id: string; name: string; email: string }): EmsUser {
  return {
    employeeId: 'E000000',
    department: 'Engineering',
    role: 'employee',
    billable: true,
    payRate: null,
    currency: 'USD',
    employmentType: 'full_time',
    status: 'active',
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: NOW,
    ...overrides,
  }
}

export const MOCK_USERS: EmsUser[] = [
  baseUser({ id: 'u-admin', name: 'Aarav Admin', email: 'admin@eniac.demo', employeeId: 'E000001', role: 'admin', billable: false, department: 'Platform' }),
  baseUser({ id: 'u-hr', name: 'Hina Rao', email: 'hr@eniac.demo', employeeId: 'E000002', role: 'hr', billable: false, department: 'People Ops', title: 'HR Partner' }),
  baseUser({ id: 'u-manager', name: 'Meera Manager', email: 'manager@eniac.demo', employeeId: 'E000003', role: 'manager', billable: false, department: 'Delivery', title: 'Delivery Manager' }),
  baseUser({ id: 'u-emp1', name: 'Esha Employee', email: 'esha@eniac.demo', employeeId: 'E000101', payRate: 85, title: 'Frontend Engineer', managerId: 'u-manager' }),
  baseUser({ id: 'u-emp2', name: 'Dev Contractor', email: 'dev@eniac.demo', employeeId: 'E000102', payRate: 95, employmentType: 'contract' as EmploymentType, title: 'Backend Engineer', managerId: 'u-manager' }),
]

export const MOCK_SESSION_USER: EmsUser = MOCK_USERS[1]!

export function usersById(): Record<string, EmsUser> {
  return Object.fromEntries(MOCK_USERS.map((u) => [u.id, u]))
}

export const MOCK_CLIENTS: Client[] = [
  { id: 'c-acme', clientCode: 'CL-2026-001', name: 'Acme Corp', normalizedName: 'acme corp', description: 'Retail chain with 45 stores nationwide; flagship customer portal modernization.', paymentTerms: 'Net 30', contactEmail: 'ap@acme.example', syncStatus: 'synced', createdAt: '2026-02-01T09:00:00.000Z', updatedAt: NOW },
  { id: 'c-globex', clientCode: 'CL-2026-002', name: 'Globex', normalizedName: 'globex', description: 'Manufacturing conglomerate; 3-year ledger migration program.', contactEmail: 'billing@globex.example', syncStatus: 'synced', createdAt: '2026-03-10T09:00:00.000Z', updatedAt: NOW },
  { id: 'c-initech', clientCode: 'CL-2026-003', name: 'Initech LLC', normalizedName: 'initech llc', syncStatus: 'pending', createdAt: '2026-09-28T09:00:00.000Z', updatedAt: NOW },
]

export const MOCK_PROJECTS: Project[] = [
  { id: 'p-portal', name: 'Acme Portal Revamp', sowNumber: 'SOW-2026-014', client: 'Acme Corp', clientId: 'c-acme', description: 'Customer portal modernization.', startDate: '2026-07-01', endDate: '2026-12-31', deadline: '2026-12-15', status: 'active', managerId: 'u-manager', supervisorId: '', teamMemberIds: ['u-emp1', 'u-emp2'], hourlyRate: 140, createdAt: '2026-06-20T09:00:00.000Z', updatedAt: NOW },
  { id: 'p-ledger', name: 'Globex Ledger', sowNumber: 'SOW-2026-021', client: 'Globex', clientId: 'c-globex', description: 'Billing ledger migration.', startDate: '2026-08-15', endDate: '2026-11-30', deadline: '2026-11-20', status: 'active', managerId: 'u-manager', supervisorId: '', teamMemberIds: ['u-emp1'], createdAt: '2026-08-01T09:00:00.000Z', updatedAt: NOW },
]

export const MOCK_ATTENDANCE: AttendanceRecord[] = [
  { id: 'att-1', userId: 'u-hr', date: MOCK_TODAY, status: 'present', markedAt: '2026-09-30T08:02:00.000Z', source: 'self' },
  { id: 'att-2', userId: 'u-emp1', date: MOCK_TODAY, status: 'present', markedAt: '2026-09-30T08:10:00.000Z', location: 'Hybrid — BLR', source: 'self' },
  { id: 'att-3', userId: 'u-emp2', date: MOCK_TODAY, status: 'remote', markedAt: '2026-09-30T08:20:00.000Z', source: 'self' },
  { id: 'att-4', userId: 'u-manager', date: MOCK_TODAY, status: 'late', markedAt: '2026-09-30T09:35:00.000Z', source: 'self' },
]

/** Dashboard aggregate fixtures (Phase 4, EMSFrontend.md §7.3). */
export const MOCK_HEADCOUNT_TREND = [
  { date: '2026-09-01', count: 42 },
  { date: '2026-09-08', count: 44 },
  { date: '2026-09-15', count: 45 },
  { date: '2026-09-22', count: 47 },
  { date: '2026-09-29', count: 47 },
]

export const MOCK_ATTENDANCE_RATE: { date: string; rate: number; present: number; absent: number }[] = [
  { date: '2026-09-20', rate: 0.92, present: 43, absent: 4 },
  { date: '2026-09-21', rate: 0.94, present: 44, absent: 3 },
  { date: '2026-09-22', rate: 0.9, present: 42, absent: 5 },
  { date: '2026-09-23', rate: 0.96, present: 45, absent: 2 },
  { date: '2026-09-24', rate: 0.94, present: 44, absent: 3 },
  { date: '2026-09-25', rate: 1, present: 0, absent: 0 },
  { date: '2026-09-26', rate: 1, present: 0, absent: 0 },
  { date: '2026-09-27', rate: 0.96, present: 45, absent: 2 },
  { date: '2026-09-28', rate: 0.92, present: 43, absent: 4 },
  { date: '2026-09-29', rate: 0.94, present: 44, absent: 3 },
  { date: '2026-09-30', rate: 0.96, present: 45, absent: 2 },
]

export const MOCK_RECENT_AUDIT = [
  { id: 'a-1', description: 'Admin deactivated user "Temp Contractor"', actor: 'Aarav Admin', timestamp: '2026-09-30T14:22:00Z', severity: 'info' as const },
  { id: 'a-2', description: 'Failed login attempt — dev@eniac.demo', actor: 'System', timestamp: '2026-09-30T09:14:00Z', severity: 'warning' as const },
  { id: 'a-3', description: 'Client CL-2026-003 synced to timesheet platform', actor: 'System', timestamp: '2026-09-29T16:30:00Z', severity: 'info' as const },
  { id: 'a-4', description: 'Project "Ledger" status changed to Active', actor: 'Meera Manager', timestamp: '2026-09-29T11:45:00Z', severity: 'info' as const },
  { id: 'a-5', description: '5 failed login attempts from 10.0.0.42 — locked', actor: 'System', timestamp: '2026-09-28T20:03:00Z', severity: 'error' as const },
  { id: 'a-6', description: 'Pay rate updated for Esha Employee', actor: 'Hina Rao', timestamp: '2026-09-28T10:18:00Z', severity: 'info' as const },
]

export const MOCK_INTEGRATIONS = [
  { system: 'Timesheet Platform', status: 'synced' as const, detail: `${MOCK_CLIENTS.filter((c) => c.syncStatus === 'synced').length} clients synced`, lastSync: '2026-09-30T06:00:00Z' },
  { system: 'Payroll Provider', status: 'syncing' as const, detail: 'Syncing period 2026-09', lastSync: '2026-09-30T05:30:00Z' },
]

export const MOCK_UPCOMING_RENEWALS = [
  { id: 'r-1', clientName: 'Acme Corp', clientCode: 'CL-2026-001', poBurn: 87500, currency: 'USD' as const, deadline: '2026-10-31' },
  { id: 'r-2', clientName: 'Globex', clientCode: 'CL-2026-002', poBurn: 42300, currency: 'USD' as const, deadline: '2026-10-15' },
]

export const MOCK_ROLE_DISTRIBUTION = [
  { role: 'Admin', count: 1, variant: 'info' as const },
  { role: 'HR', count: 1, variant: 'success' as const },
  { role: 'Manager', count: 1, variant: 'warning' as const },
  { role: 'Supervisor', count: 1, variant: 'info' as const },
  { role: 'Employee', count: 2, variant: 'default' as const },
]

export const MOCK_LATEST_ONBOARDINGS = [
  { id: 'o-1', employeeName: 'Dev Contractor', employeeId: 'E000102', status: 'active' as const, startedAt: '2026-09-28' },
  { id: 'o-2', employeeName: 'Esha Employee', employeeId: 'E000101', status: 'docs_pending' as const, startedAt: '2026-09-25' },
]

export const MOCK_ONBOARDING_PIPELINE: OnboardingPipeline = {
  invited: 2,
  docsPending: 1,
  payratePending: 0,
  ready: 1,
  active: 12,
}

export const MOCK_ATTENDANCE_EXCEPTIONS = [
  { id: 'e-1', employeeName: 'Dev Contractor', employeeId: 'E000102', date: '2026-09-30', status: 'absent', reason: 'Not marked' },
  { id: 'e-2', employeeName: 'Meera Manager', employeeId: 'E000003', date: '2026-09-30', status: 'late', reason: 'Marked at 9:35 AM' },
]

export const MOCK_PENDRATE_CHANGES = [
  { id: 'p-1', employeeName: 'Esha Employee', employeeId: 'E000101', proposedRate: 90, currency: 'USD' as const, requestedBy: 'Hina Rao', requestedAt: '2026-09-27T10:00:00Z' },
]

export const MOCK_BIRTHDAYS = [
  { id: 'b-1', name: 'Hina Rao', employeeId: 'E000002', date: '2026-10-03' },
  { id: 'b-2', name: 'Meera Manager', employeeId: 'E000003', date: '2026-10-07' },
]

export const MOCK_ANNIVERSARIES = [
  { id: 'an-1', name: 'Aarav Admin', employeeId: 'E000001', date: '2026-10-01', years: 3 },
]

export const MOCK_LEAVE_CALENDAR: Array<{ date: string; count: number }> = []
for (let day = 1; day <= 30; day++) {
  MOCK_LEAVE_CALENDAR.push({ date: `2026-09-${String(day).padStart(2, '0')}`, count: day % 7 === 0 ? 2 : day % 5 === 0 ? 1 : 0 })
}

export const MOCK_DOCUMENT_EXPIRIES = [
  { id: 'd-1', employeeName: 'Dev Contractor', kind: 'Visa', expiresAt: '2026-10-15', status: 'expired' as const },
  { id: 'd-2', employeeName: 'Esha Employee', kind: 'I-9', expiresAt: '2027-03-20', status: 'verified' as const },
]

export const MOCK_PROJECT_STATUS_DONUT = [
  { status: 'active', count: 2 },
  { status: 'completed', count: 5 },
  { status: 'archived', count: 3 },
]

export const MOCK_PROJECT_HEALTH = [
  { id: 'p-1', name: 'Acme Portal Revamp', sowNumber: 'SOW-2026-014', clientName: 'Acme Corp', clientCode: 'CL-2026-001', teamSize: 4, staffedPercent: 65, deadline: '2026-12-15', status: 'active' as const, overdue: false },
  { id: 'p-2', name: 'Globex Ledger', sowNumber: 'SOW-2026-021', clientName: 'Globex', clientCode: 'CL-2026-002', teamSize: 3, staffedPercent: 40, deadline: '2026-11-20', status: 'active' as const, overdue: false },
  { id: 'p-3', name: 'Initech Compliance', sowNumber: 'SOW-2026-030', clientName: 'Initech LLC', clientCode: 'CL-2026-003', teamSize: 2, staffedPercent: 25, deadline: '2026-10-12', status: 'active' as const, overdue: true },
]

export const MOCK_TOP_CLIENTS_BY_HOURS = [
  { id: 'c-1', name: 'Acme Corp', clientCode: 'CL-2026-001', billableHours: 128 },
  { id: 'c-2', name: 'Globex', clientCode: 'CL-2026-002', billableHours: 92 },
  { id: 'c-3', name: 'Initech LLC', clientCode: 'CL-2026-003', billableHours: 45 },
]

export const MOCK_CAPACITY_VS_DEMAND = [
  { role: 'Frontend Engineer', capacity: 120, demand: 180 },
  { role: 'Backend Engineer', capacity: 80, demand: 140 },
  { role: 'QA Engineer', capacity: 60, demand: 50 },
  { role: 'Project Manager', capacity: 40, demand: 40 },
]

export const MOCK_ASSIGNMENT_QUEUE = [
  { id: 'aq-1', name: 'Ravi Kumar', employeeId: 'E000103', department: 'Engineering', skills: ['React', 'Node.js'], billable: true },
  { id: 'aq-2', name: 'Priya Sharma', employeeId: 'E000104', department: 'Design', skills: ['Figma', 'UX'], billable: false },
  { id: 'aq-3', name: 'Arjun Patel', employeeId: 'E000105', department: 'Engineering', skills: ['Python', 'AWS'], billable: true },
]

export const MOCK_PIPELINE_STAGES = [
  { stage: 'created', label: 'Client Created', count: 3 },
  { stage: 'linked', label: 'Project Linked', count: 2 },
  { stage: 'staffed', label: 'Staffed', count: 1 },
  { stage: 'active', label: 'Active', count: 2 },
]

export const MOCK_APPROVALS_QUEUE = [
  { id: 'ap-1', employeeName: 'Esha Employee', employeeId: 'E000101', period: '2026-09-25 to 2026-10-01', hours: 38, submittedAt: '2026-10-01T09:15:00Z', status: 'pending' as const },
  { id: 'ap-2', employeeName: 'Dev Contractor', employeeId: 'E000102', period: '2026-09-25 to 2026-10-01', hours: 40, submittedAt: '2026-10-01T10:30:00Z', status: 'pending' as const },
]

export const MOCK_TEAM_ATTENDANCE_TODAY = [
  { id: 'ta-1', name: 'Esha Employee', employeeId: 'E000101', status: 'present', avatarUrl: undefined },
  { id: 'ta-2', name: 'Dev Contractor', employeeId: 'E000102', status: 'remote' },
]

export const MOCK_TIMESHEET_STATUS = [
  { id: 'ts-1', name: 'Esha Employee', employeeId: 'E000101', submitted: true, status: 'Pending' },
  { id: 'ts-2', name: 'Dev Contractor', employeeId: 'E000102', submitted: false, status: 'Not submitted' },
]

export const MOCK_WEEKLY_HOURS = [
  { id: 'wh-1', name: 'Esha Employee', hours: [7, 8, 8, 7, 6, 0, 0], total: 36 },
  { id: 'wh-2', name: 'Dev Contractor', hours: [8, 8, 8, 8, 8, 0, 0], total: 40 },
]

export const MOCK_ESCALATIONS = [
  { id: 'esc-1', description: 'Unassigned resources exceed capacity threshold', assignedTo: 'Meera Manager', severity: 'high' as const },
  { id: 'esc-2', description: 'Payrate pending approval for 3 days', assignedTo: 'Hina Rao', severity: 'medium' as const },
]

export const MOCK_MY_WEEK_HOURS = [6, 8, 8, 7, 7, 0, 0]

export const MOCK_MY_ASSIGNMENTS = [
  { id: 'ma-1', name: 'Acme Portal Revamp', clientName: 'Acme Corp', clientCode: 'CL-2026-001', billRate: 140, currency: 'USD' as const, role: 'Frontend Engineer', status: 'active' },
  { id: 'ma-2', name: 'Globex Ledger', clientName: 'Globex', clientCode: 'CL-2026-002', billRate: 130, currency: 'USD' as const, role: 'Full-stack Engineer', status: 'active' },
]

export const MOCK_DOCUMENTS_TO_SIGN = [
  { id: 'ds-1', name: 'New Contract Terms', kind: 'contract', expiresAt: '2026-10-15' },
  { id: 'ds-2', name: 'Updated NDA', kind: 'contract', expiresAt: undefined },
]

export const MOCK_RECENT_NOTIFICATIONS = [
  { id: 'n-1', title: 'Timesheet Due', message: 'Your timesheet for Sep 25–Oct 1 is due Oct 3.', createdAt: '2026-10-01T09:00:00Z', read: false },
  { id: 'n-2', title: 'Pay Rate Updated', message: 'Your hourly rate has been updated to $90/hr.', createdAt: '2026-09-28T10:18:00Z', read: true },
]

// --- Phase 5 HR fixtures (EMSFrontend.md §14 Phase 5) -------------------------

import type { OnboardingCandidate, OnboardingPipeline, LeaveRequest, LeaveType, PayRateHistoryEntry } from '../types/hr'

export const MOCK_DEPARTMENTS = ['Engineering', 'People Ops', 'Delivery', 'Design', 'Platform']

export const MOCK_ONBOARDING_CANDIDATES: OnboardingCandidate[] = [
  { id: 'oc-1', name: 'Arjun Patel', email: 'arjun@eniac.demo', employeeId: 'E000103', department: 'Engineering', stage: 'invited', invitedAt: '2026-09-28T10:00:00Z', documentsUploaded: 0, documentsTotal: 3 },
  { id: 'oc-2', name: 'Priya Sharma', email: 'priya@eniac.demo', employeeId: 'E000104', department: 'Design', stage: 'docs_pending', invitedAt: '2026-09-25T10:00:00Z', documentsUploaded: 1, documentsTotal: 3 },
  { id: 'oc-3', name: 'Marcus Chen', email: 'marcus@eniac.demo', employeeId: 'E000105', department: 'Engineering', stage: 'payrate_pending', invitedAt: '2026-09-20T10:00:00Z', documentsUploaded: 3, documentsTotal: 3 },
]

export const MOCK_LEAVE_REQUESTS: LeaveRequest[] = [
  { id: 'lr-1', userId: 'u-emp1', employeeName: 'Esha Employee', type: 'vacation', startDate: '2026-10-05', endDate: '2026-10-07', days: 3, status: 'pending', reason: 'Family trip', submittedAt: '2026-10-01T09:30:00Z', note: 'Will catch up on emails.' },
  { id: 'lr-2', userId: 'u-emp1', employeeName: 'Esha Employee', type: 'sick', startDate: '2026-09-28', endDate: '2026-09-28', days: 1, status: 'approved', submittedAt: '2026-09-25T10:00:00Z', reviewedBy: 'Meera Manager', reviewedAt: '2026-09-25T14:00:00Z' },
  { id: 'lr-3', userId: 'u-emp2', employeeName: 'Dev Contractor', type: 'vacation', startDate: '2026-10-12', endDate: '2026-10-16', days: 5, status: 'pending', submittedAt: '2026-10-02T08:00:00Z' },
  { id: 'lr-4', userId: 'u-emp2', employeeName: 'Dev Contractor', type: 'personal', startDate: '2026-09-30', endDate: '2026-09-30', days: 1, status: 'rejected', submittedAt: '2026-09-28T16:00:00Z', reviewedBy: 'Meera Manager', reviewedAt: '2026-09-29T09:00:00Z', note: 'Coverage gap' },
]

export const MOCK_PAYRATE_HISTORY: PayRateHistoryEntry[] = [
  { id: 'ph-1', userId: 'u-emp1', employeeName: 'Esha Employee', employeeId: 'E000101', oldRate: 80, newRate: 85, currency: 'USD', reason: 'Annual review', changedBy: 'Hina Rao', createdAt: '2026-09-28T10:18:00Z' },
  { id: 'ph-2', userId: 'u-emp1', employeeName: 'Esha Employee', employeeId: 'E000101', oldRate: null, newRate: 80, currency: 'USD', reason: 'Initial hire', changedBy: 'Hina Rao', createdAt: '2026-09-15T09:00:00Z' },
  { id: 'ph-3', userId: 'u-emp2', employeeName: 'Dev Contractor', employeeId: 'E000102', oldRate: null, newRate: 95, currency: 'USD', reason: 'Contract start', changedBy: 'Hina Rao', createdAt: '2026-09-10T09:00:00Z' },
  { id: 'ph-4', userId: 'u-emp2', employeeName: 'Dev Contractor', employeeId: 'E000102', oldRate: 90, newRate: 95, currency: 'USD', reason: 'Renegotiation', changedBy: 'Hina Rao', createdAt: '2026-09-20T09:00:00Z' },
]

export const MOCK_DOCUMENTS: EmsDocument[] = [
  { id: 'doc-1', userId: 'u-emp1', kind: 'id_proof', name: 'Driver License', size: 2048576, mimeType: 'image/jpeg', storageKey: 'docs/dl-esha.jpg', status: 'verified', expiresAt: '2027-05-15', uploadedBy: 'Esha Employee', createdAt: '2026-09-20T10:00:00Z' },
  { id: 'doc-2', userId: 'u-emp1', kind: 'tax_form', name: 'W-4 Form', size: 102400, mimeType: 'application/pdf', storageKey: 'docs/w4-esha.pdf', status: 'verified', uploadedBy: 'Esha Employee', createdAt: '2026-09-21T10:00:00Z' },
  { id: 'doc-3', userId: 'u-emp2', kind: 'contract', name: 'Contract v2', size: 512000, mimeType: 'application/pdf', storageKey: 'docs/contract-devv2.pdf', status: 'expired' as const, expiresAt: '2026-10-15', uploadedBy: 'Dev Contractor', createdAt: '2026-09-01T10:00:00Z' },
]

export const MOCK_DEPARTMENT_STATS = [
  { department: 'Engineering', headcount: 3, billable: 3, avgRate: 90, utilization: 82 },
  { department: 'Delivery', headcount: 1, billable: 0, avgRate: 0, utilization: 0 },
  { department: 'People Ops', headcount: 1, billable: 0, avgRate: 0, utilization: 0 },
  { department: 'Platform', headcount: 1, billable: 0, avgRate: 0, utilization: 0 },
]

export const MOCK_LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'sick', label: 'Sick' },
  { value: 'personal', label: 'Personal' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
]

// --- Phase 6 Manager fixtures (EMSFrontend.md §14 Phase 6) ----------------------

import type { Assignment } from '../types/assignment'

export const MOCK_ASSIGNMENTS: Assignment[] = [
  { id: 'as-1', userId: 'u-emp1', projectId: 'p-portal', clientId: 'c-acme', billRate: 140, payRate: 85, currency: 'USD', ftePercent: 100, roleOnProject: 'Frontend Engineer', startDate: '2026-09-01', endDate: '2026-12-31', status: 'active', timesheetEnabled: true, createdAt: '2026-09-01T09:00:00Z', updatedAt: NOW },
  { id: 'as-2', userId: 'u-emp2', projectId: 'p-portal', clientId: 'c-acme', billRate: 150, payRate: 95, currency: 'USD', ftePercent: 100, roleOnProject: 'Backend Engineer', startDate: '2026-09-01', endDate: '2026-12-31', status: 'active', timesheetEnabled: true, createdAt: '2026-09-01T09:00:00Z', updatedAt: NOW },
  { id: 'as-3', userId: 'u-emp1', projectId: 'p-ledger', clientId: 'c-globex', billRate: 130, payRate: 85, currency: 'USD', ftePercent: 50, roleOnProject: 'Frontend Engineer', startDate: '2026-09-15', endDate: '2026-11-30', status: 'ending_soon', timesheetEnabled: true, createdAt: '2026-09-15T09:00:00Z', updatedAt: NOW },
]

export const MOCK_CLIENT_BILLABLE_HOURS: Record<string, number> = {
  'c-acme': 128,
  'c-globex': 92,
  'c-initech': 45,
}

export const MOCK_CLIENT_CONTRACT_VALUE: Record<string, number> = {
  'c-acme': 87500,
  'c-globex': 42300,
  'c-initech': 18000,
}

export const MOCK_PROJECT_DEMAND = [
  { id: 'pd-1', projectName: 'Acme Portal Revamp', role: 'Backend Engineer', skills: ['Node.js', 'AWS'], seats: 2, filled: 1, startDate: '2026-07-01', endDate: '2026-12-31' },
  { id: 'pd-2', projectName: 'Globex Ledger', role: 'Frontend Engineer', skills: ['React', 'TypeScript'], seats: 1, filled: 1, startDate: '2026-08-15', endDate: '2026-11-30' },
  { id: 'pd-3', projectName: 'Initech Compliance', role: 'Full-stack Engineer', skills: ['Python', 'Django'], seats: 2, filled: 0, startDate: '2026-09-01', endDate: '2026-10-31' },
]

export const MOCK_CLIENT_CONTACTS: Record<string, { name: string; email: string; phone: string }[]> = {
  'c-acme': [{ name: 'Alice Smith', email: 'alice@acme.example', phone: '+1 555 0101' }],
  'c-globex': [{ name: 'Bob Jones', email: 'bob@globex.example', phone: '+1 555 0102' }],
  'c-initech': [{ name: 'Carol White', email: 'carol@initech.example', phone: '+1 555 0103' }],
}

export const MOCK_CLIENT_ACTIVITY = [
  { id: 'ca-1', description: 'Project "Acme Portal Revamp" created', actor: 'Meera Manager', timestamp: '2026-09-01T10:00:00Z', kind: 'project' as const },
  { id: 'ca-2', description: 'Client CL-2026-003 synced to timesheet platform', actor: 'System', timestamp: '2026-09-29T16:30:00Z', kind: 'client' as const },
  { id: 'ca-3', description: 'SOW-2026-014 updated (PO cap raised)', actor: 'Meera Manager', timestamp: '2026-09-15T14:00:00Z', kind: 'project' as const },
]

export const MOCK_PROJECT_TEAM = {
  'p-portal': [{ userId: 'u-emp1', name: 'Esha Employee', role: 'Frontend Engineer' }, { userId: 'u-emp2', name: 'Dev Contractor', role: 'Backend Engineer' }],
  'p-ledger': [{ userId: 'u-emp1', name: 'Esha Employee', role: 'Frontend Engineer' }],
}

export const MOCK_PROJECT_DOCUMENTS: Record<string, Array<{ id: string; name: string; kind: string; uploadedAt: string }>> = {
  'p-portal': [{ id: 'pd-1', name: 'SOW-2026-014.pdf', kind: 'contract', uploadedAt: '2026-06-20T09:00:00Z' }],
  'p-ledger': [{ id: 'pd-2', name: 'SOW-2026-021.pdf', kind: 'contract', uploadedAt: '2026-08-01T09:00:00Z' }],
}

// --- Phase 7 Finance / Reports fixtures (§7.8–7.9) ----------------------------

export const MOCK_HOURS_BY_PROJECT: HoursByProject[] = [
  { projectId: 'p-portal', projectName: 'Acme Portal Revamp', regularHours: 220, overtimeHours: 20, totalHours: 240 },
  { projectId: 'p-ledger', projectName: 'Globex Ledger', regularHours: 160, overtimeHours: 12, totalHours: 172 },
]

export const MOCK_HOURS_BY_EMPLOYEE: HoursByEmployee[] = [
  { userId: 'u-emp1', userName: 'Esha Employee', department: 'Engineering', regularHours: 200, overtimeHours: 18, totalHours: 218 },
  { userId: 'u-emp2', userName: 'Dev Contractor', department: 'Engineering', regularHours: 160, overtimeHours: 10, totalHours: 170 },
]

export const MOCK_OVERTIME_STATS: OvertimeStats = {
  regularHours: 360,
  overtimeHours: 28,
  totalHours: 388,
}

export const MOCK_TIMESHEET_STATUS_BREAKDOWN: TimesheetStatusBreakdown = {
  draft: 1,
  pending: 2,
  approved: 18,
  declined: 0,
  withdrawn: 1,
}

