import type { SupportedCurrencyCode } from './auth.js'

/**
 * Notifications, org/user settings and audit (EMSBackend §7.8–7.9).
 */

export type EmsNotificationType =
  | 'approval'
  | 'attendance'
  | 'onboarding'
  | 'assignment'
  | 'payrate'
  | 'document'
  | 'user'

/**
 * Mirrors `EMSFrontend/src/types/notification.ts`. The shared `notifications`
 * collection also carries legacy `body`/`link` columns; those are additive and
 * never surfaced, because the bell renders `message` and deep-links on
 * `relatedId` (`utils/notificationRoutes.ts`).
 */
export interface EmsNotification {
  id: string
  userId: string
  type: EmsNotificationType
  title: string
  message: string
  read: boolean
  createdAt: string
  relatedId?: string
}

export interface NotificationListResult {
  notifications: EmsNotification[]
  unreadCount: number
}

// ── settings ──────────────────────────────────────────────────────────────────

export interface LeavePolicy {
  annualLeaveDays: number
  sickLeaveDays: number
  /** Block a pending leave request from being edited/cancelled by the requester. */
  lockAfterApproval: boolean
}

export interface OrgSettings {
  orgName: string
  /** Employee-facing bill-rate visibility gate (security rule 4). */
  showBillRateToEmployee: boolean
  leavePolicy: LeavePolicy
  /** Ordered approval roles, e.g. `['manager','hr','admin']`. */
  approvalChain: string[]
}

export interface NotificationPrefs {
  inApp: boolean
  email: boolean
}

export interface UserSettings {
  phone: string
  notifications: NotificationPrefs
}

// ── audit ─────────────────────────────────────────────────────────────────────

export type AuditSeverity = 'info' | 'warning' | 'error'

/**
 * Same shape the admin dashboard's `recentAudit` already returns
 * (`types/dashboard.ts` AuditEvent), so the Audit Log page and the dashboard
 * widget can share one renderer and one mapper.
 */
export interface AuditEvent {
  id: string
  description: string
  actor: string
  timestamp: string
  severity: AuditSeverity
}

export interface AuditListResult {
  events: AuditEvent[]
  total: number
  page: number
  limit: number
}

export type { SupportedCurrencyCode }