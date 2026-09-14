import type { Notification } from '../types/notification'
import type { User } from '../types/auth'

/**
 * QA M11: notification deep-links were vague. "Your timesheet was approved"
 * went to the Submissions list, deadline/project notifications went to the
 * projects list — the user had to hunt for the item the notification was
 * about. This resolves a notification to the specific entity it refers to.
 *
 * Returns a route string, or null when the notification carries no
 * relatedId (nothing to deep-link to — the caller should just mark it read).
 */
export function resolveNotificationRoute(notification: Notification, currentUser: User | null): string | null {
  const { relatedId, type } = notification
  if (!relatedId) return null

  const isAdmin = currentUser?.role === 'admin'
  const isSupervisor = currentUser?.isSupervisor === true
  const prefix = isAdmin ? '/admin' : isSupervisor ? '/supervisor' : '/user'

  switch (type) {
    // Timesheet lifecycle — relatedId is the timesheet id. The employee has
    // the editor at /user/timesheets/:id. Admins and supervisors have no
    // per-timesheet route — their timesheet view is the approvals panel — so
    // route them there (the panel surfaces the specific timesheet).
    case 'submission':
    case 'approval':
    case 'decline':
    case 'withdrawal':
      return isSupervisor ? `${prefix}/approvals` : `${prefix}/timesheets/${relatedId}`

    // Project lifecycle — relatedId is the project id.
    case 'deadline':
    case 'assignment':
    case 'document':
      return `${prefix}/projects/${relatedId}`

    // User lifecycle (deactivation / role change) — relatedId is the user id.
    // Admins land on the user's detail page; everyone else lands on their own
    // settings (the only profile view a non-admin can reach).
    default:
      return isAdmin ? `/admin/users/${relatedId}` : '/user/settings'
  }
}