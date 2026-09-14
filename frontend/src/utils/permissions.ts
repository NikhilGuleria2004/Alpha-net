import type { User } from '../types/auth'
import type { Timesheet } from '../types/timesheet'
import type { UserRole } from '../types/auth'

export function canManageProjects(user: User): boolean {
  return user.role === 'admin'
}

export function canManageUsers(user: User): boolean {
  return user.role === 'admin'
}

export function canWithdrawTimesheet(user: User, timesheet: Timesheet): boolean {
  if (user.id !== timesheet.userId) return false
  return timesheet.status === 'pending'
}

export function canEditTimesheet(user: User, timesheet: Timesheet): boolean {
  if (user.id !== timesheet.userId) return false
  if (timesheet.status === 'approved') return false
  return timesheet.status === 'draft' || timesheet.status === 'withdrawn' || timesheet.status === 'declined'
}

export function canViewTimesheet(user: User, timesheet: Timesheet): boolean {
  if (user.role === 'admin') return true
  if (user.id === timesheet.userId) return true
  if (user.isSupervisor) {
    const supervisorProjects = getSupervisedProjectIds(user.id)
    const supervisorUsers = getSupervisedUserIds(user.id)
    return supervisorProjects.includes(timesheet.projectId) || supervisorUsers.includes(timesheet.userId)
  }
  return false
}

function getSupervisedProjectIds(supervisorId: string): string[] {
  try {
    const stored = localStorage.getItem('eniac_projects')
    if (!stored) return []
    const projects = JSON.parse(stored) as { supervisorId: string; id: string }[]
    return projects.filter((p) => p.supervisorId === supervisorId).map((p) => p.id)
  } catch {
    return []
  }
}

function getSupervisedUserIds(supervisorId: string): string[] {
  try {
    const stored = localStorage.getItem('eniac_users')
    if (!stored) return []
    const users = JSON.parse(stored) as { id: string; supervisorId?: string }[]
    return users.filter((u) => u.supervisorId === supervisorId).map((u) => u.id)
  } catch {
    return []
  }
}

export function canManageProjectsByRole(role: UserRole): boolean {
  return role === 'admin'
}

export function canManageUsersByRole(role: UserRole): boolean {
  return role === 'admin'
}

/**
 * QA M10: admin guardrails were discovered post-hoc — the admin clicked
 * "Deactivate" on the last active admin and got a 400 toast after the fact,
 * or demoted the last admin via Edit User and saw the same. These helpers
 * pre-check the same rules the backend enforces so the UI can disable the
 * offending control and explain why, instead of letting the request fail.
 */
export function canDeactivateUser(admin: User, target: User, allUsers: User[]): { ok: boolean; reason?: string } {
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

// Note: `allUsers` is kept in the signature for API symmetry with
// canDemoteAdmin/canDeactivateUser (QA M10) — promotion has no guard that
// needs the directory today, so the parameter is intentionally unused.
export function canPromoteToAdmin(target: User, _allUsers: User[]): { ok: boolean; reason?: string } {
  if (target.role === 'admin') {
    return { ok: false, reason: 'User is already an admin.' }
  }
  return { ok: true }
}

export function canDemoteAdmin(target: User, allUsers: User[]): { ok: boolean; reason?: string } {
  if (target.role !== 'admin') {
    return { ok: false, reason: 'User is not an admin.' }
  }
  const activeAdmins = allUsers.filter((u) => u.role === 'admin' && u.status === 'active')
  if (activeAdmins.length <= 1) {
    return { ok: false, reason: 'Cannot demote the last active admin.' }
  }
  return { ok: true }
}

export function canMakeSupervisor(target: User): { ok: boolean; reason?: string } {
  if (target.status === 'inactive') {
    return { ok: false, reason: 'Inactive users cannot become supervisors.' }
  }
  return { ok: true }
}
