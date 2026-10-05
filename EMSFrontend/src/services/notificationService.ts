/**
 * Notification service (EMSFrontend.md §7.10, Phase 7).
 */
import { api } from './apiClient'
import type { EmsNotification } from '../types/notification'

export interface GetNotificationsResponse {
  notifications: EmsNotification[]
  unreadCount: number
}

export async function getNotifications(): Promise<GetNotificationsResponse> {
  return api.get<GetNotificationsResponse>('/notifications')
}

export async function markNotificationRead(id: string): Promise<void> {
  return api.patch<void>(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  return api.post<void>('/notifications/mark-all-read')
}
