import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { formatDate } from '../../utils/date'
import type { Notification } from '../../types/notification'

export function Notifications() {
  const { user } = useAuth()
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useAppData()
  const navigate = useNavigate()

  const userNotifications = useMemo(() => {
    if (!user) return []
    return notifications
      .filter((n) => n.userId === user.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [notifications, user])

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const grouped = useMemo(() => {
    const todayItems: Notification[] = []
    const earlierItems: Notification[] = []
    for (const notification of userNotifications) {
      const createdAt = new Date(notification.createdAt)
      const createdStr = createdAt.toISOString().split('T')[0]
      if (createdStr === todayStr) {
        todayItems.push(notification)
      } else {
        earlierItems.push(notification)
      }
    }
    return { today: todayItems, earlier: earlierItems }
  }, [userNotifications, todayStr])

  const unreadCount = userNotifications.filter((n) => !n.read).length

  const handleMarkAllAsRead = async () => {
    if (!user) return
    await markAllNotificationsAsRead()
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markNotificationAsRead(notification.id)
    }
    if (notification.relatedId) {
      if (notification.type === 'submission' || notification.type === 'approval' || notification.type === 'decline' || notification.type === 'withdrawal') {
        navigate(`/admin/timesheets`)
      } else if (notification.type === 'deadline' || notification.type === 'assignment' || notification.type === 'document') {
        navigate(`/admin/projects`)
      }
    }
  }

  const NotificationItem = ({ notification }: { notification: Notification }) => (
    <button
      type="button"
      onClick={() => handleNotificationClick(notification)}
      className={`flex w-full gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted ${
        !notification.read ? 'border-l-4 border-l-indigo-500' : ''
      }`}
    >
      <div className="mt-1 shrink-0">
        {!notification.read && <span className="block h-2.5 w-2.5 rounded-full bg-indigo-600" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{notification.title}</p>
        <p className="mt-1 text-sm text-foreground">{notification.message}</p>
        <p className="mt-2 text-xs text-muted-foreground">{formatDate(notification.createdAt)}</p>
      </div>
    </button>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'You are all caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={handleMarkAllAsRead} leftIcon={<CheckCheck className="h-4 w-4" />}>
            Mark all as read
          </Button>
        )}
      </div>

      <Card>
        <div className="p-5 space-y-6">
          {userNotifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-12 w-12" />}
              title="No notifications"
              description="You don't have any notifications yet."
            />
          ) : (
            <>
              {grouped.today.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Today</h2>
                  <div className="space-y-3">
                    {grouped.today.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                  </div>
                </div>
              )}
              {grouped.earlier.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Earlier</h2>
                  <div className="space-y-3">
                    {grouped.earlier.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
