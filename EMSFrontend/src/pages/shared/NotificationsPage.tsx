/**
 * Notifications page (EMSFrontend.md §7.10, Phase 7).
 * Shared across all namespaces — shows the per-user notification feed.
 */
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { DashboardShell } from '../../components/ems/DashboardShell'
import { EmsCard } from '../../components/ems/EmsCard'
import { KpiStat } from '../../components/ems/KpiStat'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Check, CheckCheck, ExternalLink } from 'lucide-react'
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/notificationService'
import type { EmsNotification } from '../../types/notification'
import { formatDistanceToNow, format } from 'date-fns'

interface NotificationsResponse {
  notifications: EmsNotification[]
  unreadCount: number
}

function notificationHref(n: EmsNotification): string {
  switch (n.type) {
    case 'approval':
      return '/me/timesheet'
    case 'assignment':
      return '/manager/assignments'
    case 'onboarding':
      return '/hr/onboarding'
    case 'payrate':
      return '/hr/payroll'
    case 'document':
      return '/hr/documents'
    default:
      return '#'
  }
}

function notificationIcon(type: EmsNotification['type']) {
  switch (type) {
    case 'approval':
      return '✓'
    case 'attendance':
      return '🕒'
    case 'onboarding':
      return '👋'
    case 'assignment':
      return '🔗'
    case 'payrate':
      return '💰'
    case 'document':
      return '📄'
    default:
      return '🔔'
  }
}

export function NotificationsPage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [data, setData] = useState<NotificationsResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getNotifications()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load notifications'))
          addToast('error', 'Could not load notifications.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [addToast])

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    if (data) {
      const updated = data.notifications.map((n) => ({ ...n, read: true }))
      setData({ notifications: updated, unreadCount: 0 })
    }
    addToast('success', 'All notifications marked as read.')
  }

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id)
    if (data) {
      const updated = data.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
      setData({ notifications: updated, unreadCount: updated.filter((n) => !n.read).length })
    }
  }

  const unreadCount = useMemo(() => data?.unreadCount ?? 0, [data])
  const notifications = useMemo(() => data?.notifications ?? [], [data])

  return (
    <DashboardShell
      title="Notifications"
      subtitle={`Signed in as ${user?.name ?? '…'}`}
      kpiCount={1}
      loading={loading}
      error={error}
      data={data}
      onRetry={() => {
        setData(null)
        setError(null)
      }}
    >
      {() => (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <KpiStat label="Unread" value={unreadCount} />
            <Button variant="secondary" leftIcon={<CheckCheck className="h-4 w-4" />} size="sm" onClick={handleMarkAllRead}>
              Mark all as read
            </Button>
          </div>

          <EmsCard title="Recent Notifications" subtitle={`${notifications.length} total`} padding="tight">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p>No notifications.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-3 ${n.read ? 'bg-card' : 'bg-accent-soft/20'}`}
                  >
                    <span className="text-lg" aria-hidden="true">
                      {notificationIcon(n.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-sm font-medium ${n.read ? 'text-foreground' : 'text-foreground'}`}>
                            {n.title}
                          </p>
                          <p className="text-sm text-muted-foreground">{n.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(n.createdAt), 'MMM d, h:mm a')} · {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {!n.read && (
                            <Badge variant="warning" size="sm">
                              New
                            </Badge>
                          )}
                          <Link to={notificationHref(n)} aria-label={`Go to ${n.title}`}>
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </Link>
                          {!n.read && (
                            <Button size="sm" variant="ghost" onClick={() => handleMarkRead(n.id)} aria-label="Mark as read">
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </EmsCard>
        </div>
      )}
    </DashboardShell>
  )
}
