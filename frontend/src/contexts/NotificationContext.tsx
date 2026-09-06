import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Notification } from '../types/notification'
import { useAuth } from './AuthContext'
import { useAppData } from './AppDataContext'

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  refresh: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { notifications: appNotifications, refreshNotifications, markNotificationAsRead, markAllNotificationsAsRead } = useAppData()
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    if (user) {
      refreshNotifications().then(() => {
        setNotifications(appNotifications)
      })
    }
  }, [user, appNotifications, refreshNotifications])

  const unreadCount = notifications.filter((n) => !n.read).length

  const handleMarkAsRead = async (id: string) => {
    await markNotificationAsRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const handleMarkAllAsRead = async () => {
    if (!user) return
    await markAllNotificationsAsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const refresh = async () => {
    if (!user) return
    await refreshNotifications()
    setNotifications(appNotifications)
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead: handleMarkAsRead, markAllAsRead: handleMarkAllAsRead, refresh }}>
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
