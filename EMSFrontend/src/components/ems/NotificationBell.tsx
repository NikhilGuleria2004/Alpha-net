import { Bell } from 'lucide-react'
import type { EmsNotification } from '../../types/notification'

interface NotificationBellProps {
  notifications: EmsNotification[]
  onOpen?: () => void
  className?: string
}

/**
 * Topbar bell with unread badge (EMSFrontend.md §7.10). Presentational — the
 * dropdown + full page land in Phase 5; the badge math lives here.
 */
export function NotificationBell({ notifications, onOpen, className = '' }: NotificationBellProps) {
  const unread = notifications.filter((n) => !n.read).length
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className={`relative inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-border bg-card px-2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      <Bell className="h-4 w-4" aria-hidden="true" />
      {unread > 0 && (
        <span className="ems-tabular absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
