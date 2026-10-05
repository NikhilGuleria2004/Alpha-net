import type { EmsUser } from '../types/auth'
import type { EmsNotification } from '../types/notification'

/**
 * Resolve an EMS notification to the specific route it refers to (EMSFrontend.md §7.10).
 *
 * Adapted from the sibling `notificationRoutes.ts` for the four EMS role
 * namespaces (`/admin`, `/hr`, `/manager`, `/me`). Returns
 * `null` when the notification carries no `relatedId` — the caller should just
 * mark it read.
 */

function rolePrefix(user: EmsUser | null): string {
  switch (user?.role) {
    case 'admin':
      return '/admin'
    case 'hr':
      return '/hr'
    case 'manager':
      return '/manager'
    case 'employee':
    default:
      return '/me'
  }
}

export function resolveNotificationRoute(
  notification: EmsNotification,
  currentUser: EmsUser | null,
): string | null {
  const { relatedId, type } = notification
  if (!relatedId) return null

  const prefix = rolePrefix(currentUser)

  switch (type) {
    // Timesheet lifecycle — admins land on the approvals queue (which surfaces
    // the specific item); billable staff land on their timesheet.
    case 'approval':
      return currentUser?.role === 'admin' ? `${prefix}/approvals` : `${prefix}/timesheet`
    // Attendance exceptions — relatedId is the user id.
    case 'attendance':
      return currentUser?.role === 'employee' ? `${prefix}/attendance` : `${prefix}/attendance/team`
    // Onboarding pipeline — relatedId is the onboarding/invite id.
    case 'onboarding':
      return `${prefix}/onboarding/${relatedId}`
    // Assignment changes — relatedId is the assignment id.
    case 'assignment':
      return currentUser?.role === 'employee' ? `${prefix}/work` : `${prefix}/assignments/${relatedId}`
    // Payrate changes — relatedId is the user id.
    case 'payrate':
      return currentUser?.role === 'employee' ? '/me/profile' : `${prefix}/employees/${relatedId}`
    // Document events — relatedId is the document id.
    case 'document':
      return `${prefix}/documents/${relatedId}`
    // User lifecycle — admins land on the user detail; everyone else on their
    // own profile (the only person view a non-admin can reach).
    default:
      return currentUser?.role === 'admin' || currentUser?.role === 'hr'
        ? `${prefix}/employees/${relatedId}`
        : '/me/profile'
  }
}
