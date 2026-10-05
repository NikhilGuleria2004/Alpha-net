import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import type { EmsNotification } from '../types/notification'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notificationService'

/** Minimal notification feed (EMSFrontend.md §7.10, §10). */

interface NotificationContextValue {
  notifications: EmsNotification[]
  unreadCount: number
  markRead: (id: string) => void
  markAllRead: () => void
  push: (notification: EmsNotification) => void
  loading: boolean
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [notifications, setNotifications] = useState<EmsNotification[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch notifications when user is authenticated and auth is not loading
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setNotifications([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    getNotifications()
      .then((result) => {
        if (!cancelled) setNotifications(result.notifications)
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load notifications.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading, addToast])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  const markRead = useCallback((id: string) => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    markNotificationRead(id).catch((err) => {
      // Revert on error
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)))
      addToast('error', err instanceof Error ? err.message : 'Could not mark notification as read.')
    })
  }, [addToast])

  const markAllRead = useCallback(() => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    markAllNotificationsRead().catch((err) => {
      // Revert on error - we'd need to refetch to get exact state, but for now just show error
      addToast('error', err instanceof Error ? err.message : 'Could not mark all notifications as read.')
      // Refetch to restore correct state
      getNotifications().then((result) => setNotifications(result.notifications)).catch(() => {})
    })
  }, [addToast])

  const push = useCallback((notification: EmsNotification) => {
    setNotifications((prev) => [notification, ...prev])
  }, [])

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, push, loading }}>
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
