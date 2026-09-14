import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react'
import type { Notification } from '../types/notification'
import { useAppData } from './AppDataContext'
import { useAuth } from './AuthContext'
import { getNotificationCount } from '../services/notificationService'

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
 *
 * The unread badge is sourced from GET /notifications/unread-count (a Mongo
 * countDocuments call) rather than derived from the in-memory list. The list
 * itself is capped at 50 by the service default, so a derived count would
 * plateau at 50 for heavy users (QA M2).
 *
 * QA M11b: this context also mounts a visibility-aware 15s poller that
 * refreshes notifications and the unread count without a user action, so a
 * background tab learns of approvals instead of waiting for the next manual
 * refresh.
 */
const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const {
    notifications,
    refreshNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    startNotificationPoll,
    stopNotificationPoll,
  } = useAppData()
  const { isAuthenticated } = useAuth()

  const [unreadCount, setUnreadCount] = useState(0)

  // Seed the badge from the uncapped endpoint. The in-memory list is the
  // fallback while the endpoint resolves, so the badge is never briefly 0.
  // QA A11: only while authenticated. This effect previously ran on mount
  // unconditionally, so the logged-out login screen fired
  // /notifications/unread-count with no credentials and generated a 401 (plus
  // a refresh attempt) on every anonymous load. When isAuthenticated flips
  // true — after login or a session restore — the effect re-runs and seeds
  // the badge.
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0)
      return
    }
    let cancelled = false
    async function loadCount() {
      try {
        const count = await getNotificationCount()
        if (!cancelled) setUnreadCount(count)
      } catch {
        // Keep the derived count if the endpoint fails.
      }
    }
    loadCount()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  // QA M11b: start the visibility-aware poller while authenticated and stop
  // it on unmount — and on logout (QA A11) — so idle tabs and the logged-out
  // login screen don't waste requests.
  useEffect(() => {
    if (!isAuthenticated) {
      stopNotificationPoll()
      return
    }
    startNotificationPoll()
    return () => stopNotificationPoll()
  }, [isAuthenticated, startNotificationPoll, stopNotificationPoll])

  // Re-sync the badge from the endpoint whenever the notifications list
  // changes — the poller refreshes the list, and this effect keeps the badge
  // honest without a second API call per poll. Guarded on authentication for
  // the same reason as the seed effect above (QA A11).
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    async function syncCount() {
      try {
        const count = await getNotificationCount()
        if (!cancelled) setUnreadCount(count)
      } catch {
        // Keep the existing count if the endpoint fails.
      }
    }
    syncCount()
    return () => {
      cancelled = true
    }
  }, [notifications, isAuthenticated])

  // Re-sync the badge after any mutation that flips read state. The endpoint
  // is the source of truth; the derived count is just the optimistic value
  // while it resolves.
  const markAsRead = async (id: string) => {
    await markNotificationAsRead(id)
    try {
      setUnreadCount(await getNotificationCount())
    } catch {
      // fall back to the derived count
    }
  }

  const markAllAsRead = async () => {
    await markAllNotificationsAsRead()
    try {
      setUnreadCount(await getNotificationCount())
    } catch {
      // fall back to the derived count
    }
  }

  const derivedUnreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  )

  // Prefer the endpoint count; fall back to the derived count when the
  // endpoint hasn't resolved or is unavailable.
  const resolvedUnreadCount = unreadCount > 0 ? unreadCount : derivedUnreadCount

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: resolvedUnreadCount,
      markAsRead,
      markAllAsRead,
      refresh: refreshNotifications,
    }),
    [notifications, resolvedUnreadCount, markAsRead, markAllAsRead, refreshNotifications]
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