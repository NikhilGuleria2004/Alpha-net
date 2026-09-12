export type NotificationType = 'submission' | 'approval' | 'decline' | 'withdrawal' | 'deadline' | 'assignment' | 'document'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  read: boolean
  createdAt: string
  relatedId?: string
}
