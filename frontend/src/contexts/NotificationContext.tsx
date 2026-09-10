import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Notification } from '../types/notification'
import { useAppData } from './AppDataContext'

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * A thin, derived view over AppData notifications.
 *
 * Holds no state and runs no effects of its own: notifications are fetched
 * once on login by AppDataProvider, and this context simply projects them
 * (plus an unread count) for consumers. This intentionally avoids the
 * previous fetch-in-effect loop (QA finding C3).
 */
const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const {
    notifications,
    refreshNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  } = useAppData()

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  )

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      markAsRead: markNotificationAsRead,
      markAllAsRead: markAllNotificationsAsRead,
      refresh: refreshNotifications,
    }),
    [notifications, unreadCount, markNotificationAsRead, markAllNotificationsAsRead, refreshNotifications]
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}