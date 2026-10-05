/**
 * EMS notifications (EMSFrontend.md §7.10).
 *
 * Extends the sibling notification types with EMS-local event kinds
 * (attendance, onboarding, payrate). Deep-linking lives in
 * `utils/notificationRoutes.ts`.
 */

export type EmsNotificationType =
  | 'approval'
  | 'attendance'
  | 'onboarding'
  | 'assignment'
  | 'payrate'
  | 'document'
  | 'user'

export interface EmsNotification {
  id: string
  userId: string
  type: EmsNotificationType
  title: string
  message: string
  read: boolean
  createdAt: string
  /** Entity the notification is about (drives the deep-link). */
  relatedId?: string
}
