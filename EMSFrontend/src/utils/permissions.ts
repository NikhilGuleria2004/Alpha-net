import type { EmsUser } from '../types/auth'

/**
 * EMS capability model (EMSFrontend.md §6.2–6.3).
 *
 * UI gates on capabilities — never raw role strings — so a role remodel only
 * touches this file. Adapted from the sibling `permissions.ts`: the
 * timesheet-level predicates (canEditTimesheet, …) stay in the timesheet app;
 * the EMS owns the employment-lifecycle capabilities plus the ported admin
 * guardrails (QA M10) for the employee directory.
 */

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
 * Derive the capability object for a user. `null` (signed out) and inactive
 * users get no capabilities — callers render `PermissionGate` fallbacks.
 * Supervisor timesheet access follows the billable flag (§6.2, §17 D-2).
 */
export function getCapabilities(user: EmsUser | null): Capabilities {
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
        markAttendance: false, // admin is attendance-exempt (§6.2)
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
        manageSettings: true, // HR-scoped settings only
      }
    case 'manager':
      return {
        ...NO_ACCESS,
        viewOwnDashboard: true,
        viewAllEmployees: true, // read-only resources view
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
  }
}

/**
 * Admin guardrails (ported QA M10): the backend enforces these, but the UI
 * pre-checks so it can disable the control with an explanation instead of
 * letting the request fail with a 400 toast.
 */
export function canDeactivateUser(
  admin: EmsUser,
  target: EmsUser,
  allUsers: EmsUser[],
): { ok: boolean; reason?: string } {
  if (admin.id === target.id) {
    return { ok: false, reason: 'You cannot deactivate your own account.' }
  }
  if (target.role === 'admin' && target.status === 'active') {
    const activeAdmins = allUsers.filter((u) => u.role === 'admin' && u.status === 'active')
    if (activeAdmins.length <= 1) {
      return { ok: false, reason: 'Cannot deactivate the last active admin.' }
    }
  }
  return { ok: true }
}

export function canPromoteToAdmin(target: EmsUser): { ok: boolean; reason?: string } {
  if (target.role === 'admin') {
    return { ok: false, reason: 'User is already an admin.' }
  }
  return { ok: true }
}

export function canDemoteAdmin(target: EmsUser, allUsers: EmsUser[]): { ok: boolean; reason?: string } {
  if (target.role !== 'admin') {
    return { ok: false, reason: 'User is not an admin.' }
  }
  const activeAdmins = allUsers.filter((u) => u.role === 'admin' && u.status === 'active')
  if (activeAdmins.length <= 1) {
    return { ok: false, reason: 'Cannot demote the last active admin.' }
  }
  return { ok: true }
}
