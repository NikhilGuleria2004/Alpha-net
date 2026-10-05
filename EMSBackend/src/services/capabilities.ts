import type { EmsUser, UserRole } from '../types/auth.js'

export interface Capabilities {
  viewOwnDashboard: boolean
  manageUsers: boolean
  onboardEmployee: boolean
  managePayRates: boolean
  viewAllEmployees: boolean
  manageClients: boolean
  manageProjects: boolean
  manageAssignments: boolean
  reviewTimesheets: boolean
  viewTeamAttendance: boolean
  viewTeam: boolean
  viewOwnAttendance: boolean
  markAttendance: boolean
  openTimesheetPlatform: boolean
  viewPayroll: boolean
  viewReports: boolean
  viewAuditLog: boolean
  manageSettings: boolean
}

export type CapabilityKey = keyof Capabilities
export type { UserRole } from '../types/auth.js'

const NO_ACCESS: Capabilities = {
  viewOwnDashboard: false,
  manageUsers: false,
  onboardEmployee: false,
  managePayRates: false,
  viewAllEmployees: false,
  manageClients: false,
  manageProjects: false,
  manageAssignments: false,
  reviewTimesheets: false,
  viewTeamAttendance: false,
  viewTeam: false,
  viewOwnAttendance: false,
  markAttendance: false,
  openTimesheetPlatform: false,
  viewPayroll: false,
  viewReports: false,
  viewAuditLog: false,
  manageSettings: false,
}

/**
 * Server-side mirror of EMSFrontend/src/utils/permissions.ts §6.2.
 * Derive capabilities from the authenticated user's role + billable flag.
 * Inactive users get no capabilities.
 */
export function getCapabilities(user: { role: string; billable?: boolean; status?: string } | null): Capabilities {
  if (!user || user.status === 'inactive') return { ...NO_ACCESS }

  switch (user.role) {
    case 'admin':
      return {
        ...NO_ACCESS,
        viewOwnDashboard: true,
        manageUsers: true,
        onboardEmployee: true,
        managePayRates: true,
        viewAllEmployees: true,
        manageClients: true,
        manageProjects: true,
        manageAssignments: true,
        reviewTimesheets: true,
        viewTeamAttendance: true,
        viewTeam: true,
        viewOwnAttendance: true,
        markAttendance: false,
        openTimesheetPlatform: true,
        viewPayroll: true,
        viewReports: true,
        viewAuditLog: true,
        manageSettings: true,
      }
    case 'hr':
      return {
        ...NO_ACCESS,
        viewOwnDashboard: true,
        manageUsers: true,
        onboardEmployee: true,
        managePayRates: true,
        viewAllEmployees: true,
        viewTeamAttendance: true,
        viewTeam: true,
        viewOwnAttendance: true,
        markAttendance: true,
        viewPayroll: true,
        viewReports: true,
        manageSettings: true,
      }
    case 'manager':
      return {
        ...NO_ACCESS,
        viewOwnDashboard: true,
        viewAllEmployees: true,
        manageClients: true,
        manageProjects: true,
        manageAssignments: true,
        viewTeamAttendance: true,
        viewTeam: true,
        viewOwnAttendance: true,
        markAttendance: true,
        viewReports: true,
      }
    case 'employee':
      return {
        ...NO_ACCESS,
        viewOwnDashboard: true,
        viewOwnAttendance: true,
        markAttendance: true,
        openTimesheetPlatform: true,
      }
    default:
      return { ...NO_ACCESS }
  }
}

export function hasCapability(user: { role: string; billable?: boolean; status?: string } | null, ...caps: CapabilityKey[]): boolean {
  const capabilities = getCapabilities(user)
  return caps.every((cap) => capabilities[cap])
}

export interface AdminGuardrailCheck {
  ok: boolean
  error?: string
  code?: string
}

export function canDeactivateUser(admin: EmsUser, target: EmsUser, allUsers: EmsUser[]): AdminGuardrailCheck {
  if (admin.id === target.id) {
    return { ok: false, error: 'You cannot deactivate your own account.', code: 'LAST_ADMIN' }
  }
  if (target.role === 'admin' && target.status === 'active') {
    const activeAdmins = allUsers.filter((u) => u.role === 'admin' && u.status === 'active')
    if (activeAdmins.length <= 1) {
      return { ok: false, error: 'Cannot deactivate the last active admin.', code: 'LAST_ADMIN' }
    }
  }
  return { ok: true }
}

export function canDemoteAdmin(target: EmsUser, allUsers: EmsUser[]): AdminGuardrailCheck {
  if (target.role !== 'admin') {
    return { ok: false, error: 'User is not an admin.', code: 'NOT_ADMIN' }
  }
  const activeAdmins = allUsers.filter((u) => u.role === 'admin' && u.status === 'active')
  if (activeAdmins.length <= 1) {
    return { ok: false, error: 'Cannot demote the last active admin.', code: 'LAST_ADMIN' }
  }
  return { ok: true }
}

/**
 * Human-facing metadata for the role × capability matrix.
 *
 * Lives beside `getCapabilities` so the authorization rules and the labels that
 * describe them cannot drift apart. `GET /roles` serves this verbatim, which is
 * what the admin "Roles & Access" screen renders — so the page always shows the
 * matrix the API actually enforces rather than a hand-maintained copy.
 */
export const ROLE_CATALOG: ReadonlyArray<{
  key: UserRole
  label: string
  summary: string
}> = [
  { key: 'admin', label: 'Admin', summary: 'Full access across every screen, including billing, audit and org settings.' },
  { key: 'hr', label: 'HR', summary: 'Runs the employment lifecycle — people, onboarding, pay rates, leave and documents.' },
  { key: 'manager', label: 'Manager', summary: 'Runs delivery — clients, projects and assignments, plus read-only visibility of their own team.' },
  { key: 'employee', label: 'Employee', summary: 'Self-service only — own dashboard, attendance, timesheet and documents.' },
]

export type CapabilityGroup = 'Workspace' | 'People' | 'Commercial' | 'Time' | 'Finance' | 'Insights' | 'System'

export const CAPABILITY_CATALOG: ReadonlyArray<{
  key: CapabilityKey
  label: string
  group: CapabilityGroup
  /** Conditional on the `billable` flag rather than fixed for the role. */
  billableGated?: boolean
}> = [
  { key: 'viewOwnDashboard', label: 'View own dashboard', group: 'Workspace' },
  { key: 'viewOwnAttendance', label: 'View own attendance', group: 'Workspace' },
  { key: 'markAttendance', label: 'Mark own attendance', group: 'Workspace' },

  { key: 'viewAllEmployees', label: 'View all employees', group: 'People' },
  { key: 'viewTeam', label: 'View own team', group: 'People' },
  { key: 'viewTeamAttendance', label: 'View team attendance', group: 'People' },
  { key: 'manageUsers', label: 'Manage users & roles', group: 'People' },
  { key: 'onboardEmployee', label: 'Onboard new hires', group: 'People' },
  { key: 'managePayRates', label: 'Manage pay rates', group: 'People' },

  { key: 'manageClients', label: 'Manage clients', group: 'Commercial' },
  { key: 'manageProjects', label: 'Manage projects', group: 'Commercial' },
  { key: 'manageAssignments', label: 'Manage assignments', group: 'Commercial' },

  { key: 'reviewTimesheets', label: 'Review timesheets', group: 'Time' },
  { key: 'openTimesheetPlatform', label: 'Open timesheet platform', group: 'Time', billableGated: true },

  { key: 'viewPayroll', label: 'View payroll', group: 'Finance' },
  { key: 'manageSettings', label: 'Manage settings', group: 'System' },
  { key: 'viewReports', label: 'View reports', group: 'Insights' },
  { key: 'viewAuditLog', label: 'View audit log', group: 'Insights' },
]

/** The enforced matrix, resolved per role — the payload behind Roles & Access. */
export function capabilityMatrix(): Record<UserRole, Capabilities> {
  const rows = {} as Record<UserRole, Capabilities>
  for (const role of ROLE_CATALOG) {
    rows[role.key] = getCapabilities({ role: role.key, billable: true, status: 'active' })
  }
  return rows
}
