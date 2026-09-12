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
