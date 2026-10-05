/**
 * Dashboard aggregate types (EMSFrontend.md §7.3).
 *
 * Each dashboard calls `GET /dashboard/<role>` — a single aggregate endpoint
 * per role (§12: ≤3 requests for FMP). The shapes below mirror the spec sections
 * 7.3.1–7.3.5 and are consumed by the role-specific dashboard pages.
 */

export type ProjectStage = 'created' | 'linked' | 'staffed' | 'active' | 'completed'
export type OnboardingStatus = 'invited' | 'docs_pending' | 'payrate_pending' | 'ready' | 'active'
export type ApprovalStatus = 'pending' | 'approved' | 'declined'
export type PayrollStatus = 'draft' | 'approved' | 'paid'
export type DocumentExpiryStatus = 'pending' | 'verified' | 'expired'

export interface HeadcountTrend {
  /** ISO date `YYYY-MM-DD`. */
  date: string
  count: number
}

export interface AttendanceRatePoint {
  /** ISO date `YYYY-MM-DD`. */
  date: string
  /** 0–1 fraction. */
  rate: number
  present: number
  absent: number
}

export interface ProjectStatusDonut {
  status: ProjectStage
  count: number
}

export interface PipelineStage {
  stage: ProjectStage
  label: string
  count: number
}

export interface UpcomingRenewal {
  id: string
  clientName: string
  clientCode: string
  poBurn: number
  currency: 'USD' | 'INR' | 'EUR' | 'GBP'
  deadline: string
}

export interface RoleDistribution {
  role: string
  count: number
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

export interface LatestOnboarding {
  id: string
  employeeName: string
  employeeId: string
  status: OnboardingStatus
  startedAt: string
}

export interface AuditEvent {
  id: string
  description: string
  actor: string
  timestamp: string
  severity: 'info' | 'warning' | 'error'
}

export interface IntegrationStatus {
  system: string
  status: 'synced' | 'syncing' | 'error' | 'disconnected'
  detail: string
  lastSync: string
}

/** Section 7.3.1 — Admin dashboard aggregate. */
export interface AdminDashboardData {
  activeEmployees: { total: number; billable: number; nonBillable: number }
  openClientIds: number
  activeProjects: number
  attendanceToday: { present: number; absent: number; late: number }
  revenueAtRisk: { amount: number; currency: 'USD' | 'INR' | 'EUR' | 'GBP'; projectCount: number }
  headcountTrend: HeadcountTrend[]
  attendanceRate: AttendanceRatePoint[]
  projectStatusDonut: ProjectStatusDonut[]
  recentAudit: AuditEvent[]
  failedLogins: number
  integrations: IntegrationStatus[]
  upcomingRenewals: UpcomingRenewal[]
  roleDistribution: RoleDistribution[]
  latestOnboardings: LatestOnboarding[]
  updatedAt: string
}

/** Section 7.3.2 — HR dashboard aggregate. */
export interface HrDashboardData {
  totalHeadcount: number
  newThisMonth: number
  pendingOnboardings: number
  onLeaveToday: number
  attendanceCompliance: number
  onboardingPipeline: { invited: number; docsPending: number; payratePending: number; ready: number; active: number }
  attendanceExceptions: Array<{
    id: string
    employeeName: string
    employeeId: string
    date: string
    status: string
    reason?: string
  }>
  payrateChangesPending: Array<{
    id: string
    employeeName: string
    employeeId: string
    proposedRate: number
    currency: 'USD' | 'INR' | 'EUR' | 'GBP'
    requestedBy: string
    requestedAt: string
  }>
  upcomingBirthdays: Array<{
    id: string
    name: string
    employeeId: string
    date: string
  }>
  upcomingAnniversaries: Array<{
    id: string
    name: string
    employeeId: string
    date: string
    years: number
  }>
  leaveCalendar: Array<{
    date: string
    count: number
  }>
  documentExpiries: Array<{
    id: string
    employeeName: string
    kind: string
    expiresAt: string
    status: DocumentExpiryStatus
  }>
  updatedAt: string
}

/** Section 7.3.3 — Manager dashboard aggregate. */
export interface ManagerDashboardData {
  activeClients: number
  activeProjects: number
  unassignedResources: number
  utilizationPercent: number
  billableHoursWeek: number
  pipelineStages: PipelineStage[]
  assignmentQueue: Array<{
    id: string
    name: string
    employeeId: string
    department: string
    skills: string[]
    billable: boolean
  }>
  projectHealth: Array<{
    id: string
    name: string
    sowNumber: string
    clientName: string
    clientCode: string
    teamSize: number
    staffedPercent: number
    deadline: string
    status: ProjectStage
    overdue: boolean
  }>
  topClientsByHours: Array<{
    id: string
    name: string
    clientCode: string
    billableHours: number
  }>
  capacityVsDemand: Array<{
    role: string
    capacity: number
    demand: number
  }>
  updatedAt: string
}

/** Section 7.3.5 — Employee dashboard aggregate. */
export interface EmployeeDashboardData {
  attendanceStreak: number
  hoursThisWeek: number
  assignedProjects: number
  pendingLeaveRequests: number
  todayAttendance: {
    marked: boolean
    status?: string
    nextAction: string
  }
  myWeekHours: number[]
  myAssignments: Array<{
    id: string
    name: string
    clientName: string
    clientCode: string
    billRate?: number
    currency?: 'USD' | 'INR' | 'EUR' | 'GBP'
    role: string
    status: string
  }>
  openTimesheetHandoff: boolean
  documentsToSign: Array<{
    id: string
    name: string
    kind: string
    expiresAt?: string
  }>
  recentNotifications: Array<{
    id: string
    title: string
    message: string
    createdAt: string
    read: boolean
  }>
  updatedAt: string
}

export type DashboardRole = 'admin' | 'hr' | 'manager' | 'employee'

export interface DashboardResponse {
  role: DashboardRole
  updatedAt: string
  data: unknown
}
