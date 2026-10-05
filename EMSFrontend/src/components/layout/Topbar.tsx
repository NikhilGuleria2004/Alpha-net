import { useEffect, useMemo, useRef, useState } from 'react'
import { useMatches, useNavigate } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotifications } from '../../contexts/NotificationContext'
import { useToast } from '../../contexts/ToastContext'
import { useUiStore } from '../../stores/uiStore'
import { useIsMac } from '../../hooks/useIsMac'
import { resolveNotificationRoute } from '../../utils/notificationRoutes'
import { formatDateTime } from '../../utils/date'
import { Breadcrumbs } from './Breadcrumbs'
import { ProfileDropdown } from './ProfileDropdown'
import { namespaceForRole } from './nav'
import { ThemeToggle } from '../ui/ThemeToggle'
import { DensityToggle } from '../ems/DensityToggle'
import { NotificationBell } from '../ems/NotificationBell'
import { EmptyState } from '../ui/EmptyState'
import type { EmsHandle } from '../../types/router'

interface TopbarProps {
  onToggleMobile?: () => void
}

/**
 * Topbar (EMSFrontend.md §14 Phase 2 2.2): hamburger (mobile), breadcrumb
 * trail derived from route `handle.breadcrumb`s via `useMatches` (§5.3),
 * command-palette trigger (⌘K), notifications bell + dropdown with deep
 * links (§7.10), theme + density toggles, and the profile menu.
 */
export function Topbar({ onToggleMobile }: TopbarProps) {
  const { user } = useAuth()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const matches = useMatches()
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const isMac = useIsMac()
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const notificationsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNotificationsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Breadcrumbs straight off the route tree (§5.3): every match that declares
  // `handle.breadcrumb` contributes a crumb, deepest last. No per-page
  // breadcrumb wiring — adding a route with a handle is enough.
  const crumbs = useMemo(
    () =>
      matches
        .map((match) => {
          const handle = match.handle as EmsHandle | undefined
          return handle?.breadcrumb ? { label: handle.breadcrumb, href: match.pathname } : null
        })
        .filter((crumb): crumb is { label: string; href: string } => crumb !== null),
    [matches],
  )

  const recentNotifications = notifications.slice(0, 5)
  // Guide ("show platform-specific symbols"). NBSP so the tokens never wrap apart.
  const searchKeyLabel = isMac ? '\u2318\u00a0+\u00a0K' : 'Ctrl\u00a0+\u00a0K'

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4 sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onToggleMobile}
        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 sm:block">
          <Breadcrumbs items={crumbs} />
        </nav>
      )}

      <div className={`flex items-center gap-2 sm:gap-3 ${crumbs.length > 0 ? '' : 'flex-1'}`}>
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent md:px-3"
          aria-label="Search and commands"
          title="Search and commands"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden text-sm md:inline">Search…</span>
          <kbd className="ems-tabular hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground md:inline">
            {searchKeyLabel}
          </kbd>
        </button>

        <ThemeToggle />
        <DensityToggle />

        <div className="relative" ref={notificationsRef}>
          <NotificationBell notifications={notifications} onOpen={() => setIsNotificationsOpen((prev) => !prev)} />
          {isNotificationsOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-card shadow-lg sm:w-80">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        markAllRead()
                        addToast('success', 'All notifications marked as read')
                      }}
                      className="text-xs text-accent hover:text-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recentNotifications.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="No notifications" description="You’re up to date." />
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {recentNotifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                          markRead(notification.id)
                          // Deep-link to the entity the notification refers to,
                          // not a generic list (§7.10).
                          const route = resolveNotificationRoute(notification, user)
                          if (route) navigate(route)
                          setIsNotificationsOpen(false)
                        }}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          notification.read ? 'opacity-60' : 'bg-accent-soft/50'
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? 'bg-border' : 'bg-accent'}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">{notification.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{notification.message}</span>
                          <span className="ems-tabular mt-1 block text-xs text-muted-foreground">
                            {formatDateTime(notification.createdAt)}
                          </span>
                        </span>
                        <span className="sr-only">{notification.read ? 'Read' : 'Unread'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-border px-4 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsNotificationsOpen(false)
                    if (user) navigate(`${namespaceForRole(user.role)}/notifications`)
                  }}
                  className="text-xs font-medium text-accent hover:text-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        <ProfileDropdown />
      </div>
    </header>
  )
}
