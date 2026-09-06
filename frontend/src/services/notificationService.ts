import type { Notification } from '../types/notification'
import apiClient from './apiClient'

export async function getNotifications(): Promise<Notification[]> {
  const response = await apiClient.get<{ notifications: Notification[] }>('/notifications')
  return response.notifications
}

export async function getUnreadNotifications(): Promise<Notification[]> {
  const response = await apiClient.get<{ notifications: Notification[] }>('/notifications?unread=true')
  return response.notifications
}

export async function markAsRead(id: string): Promise<void> {
  await apiClient.post<void>(`/notifications/${id}/read`)
}

export async function markAllAsRead(): Promise<void> {
  await apiClient.post<void>('/notifications/read-all')
}

export async function createNotification(data: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> {
  const response = await apiClient.post<{ notification: Notification }>('/notifications', data)
  return response.notification
}

export async function getNotificationCount(): Promise<number> {
  const response = await apiClient.get<{ unreadCount: number }>('/notifications/unread-count')
  return response.unreadCount
}
