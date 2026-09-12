import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, ChevronDown, Menu, Bell, FolderKanban, User, Settings, LogOut, Clock3 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { useNotifications } from '../../contexts/NotificationContext'
import { useToast } from '../../contexts/ToastContext'
import { Avatar } from '../ui/Avatar'
import { EmptyState } from '../ui/EmptyState'

interface TopbarProps {
  onToggleMobile?: () => void
}

type SearchResult = {
  id: string
  name: string
  type: 'project' | 'user' | 'timesheet'
  href: string
}

export function Topbar({ onToggleMobile }: TopbarProps) {
  const { user, logout } = useAuth()
  const { projects, users, timesheets } = useAppData()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const profileRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setIsProfileOpen(false)
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setIsSearchOpen(false)
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) setIsNotificationsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
      if (event.key === 'Escape') {
        setIsSearchOpen(false)
        setIsProfileOpen(false)
        setIsNotificationsOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const breadcrumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    const crumbs: { label: string; href?: string }[] = []
    const prefix = user?.role === 'admin' ? 'admin' : user?.role === 'user' ? 'user' : 'supervisor'

    if (segments[0] === prefix && segments[1]) {
      crumbs.push({ label: prefix === 'admin' ? 'Admin' : prefix === 'user' ? 'User' : 'Supervisor', href: `/${prefix}/dashboard` })
      const section = segments[1]
      const sectionLabels: Record<string, string> = {
        dashboard: 'Dashboard',
        projects: 'Projects',
        'projects/new': 'New Project',
        users: 'Users',
        'users/new': 'New User',
        supervisors: 'Supervisors',
        timesheets: 'Timesheets',
        approvals: 'Approvals',
        reports: 'Reports',
        notifications: 'Notifications',
        settings: 'Settings',
        submissions: 'Submissions',
      }
      if (section === 'projects' && segments[2]) {
        crumbs.push({ label: 'Projects', href: '/admin/projects' })
        const project = projects.find((p) => p.id === segments[2])
        crumbs.push({ label: project?.name || 'Project Details' })
      } else if (section === 'users' && segments[2]) {
        crumbs.push({ label: 'Users', href: '/admin/users' })
        const user = users.find((u) => u.id === segments[2])
        crumbs.push({ label: user?.name || 'User Details' })
      } else if (section === 'timesheets' && segments[2]) {
        crumbs.push({ label: 'Timesheets', href: '/user/timesheets' })
        const ts = timesheets.find((t) => t.id === segments[2])
        const project = ts ? projects.find((p) => p.id === ts.projectId) : null
        crumbs.push({ label: project?.name || 'Timesheet' })
      } else if (sectionLabels[section]) {
        crumbs.push({ label: sectionLabels[section] })
      }
    }

    if (crumbs.length === 0) {
      crumbs.push({ label: 'Dashboard', href: user?.role === 'admin' ? '/admin/dashboard' : '/user/dashboard' })
    }
    return crumbs
  }, [location.pathname, user?.role, projects, users, timesheets])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const lower = query.toLowerCase()
    const results: SearchResult[] = []

    for (const p of projects) {
      if (p.name.toLowerCase().includes(lower) || p.sowNumber.toLowerCase().includes(lower) || p.client.toLowerCase().includes(lower)) {
        results.push({ id: p.id, name: p.name, type: 'project', href: `/admin/projects/${p.id}` })
      }
    }
    for (const u of users) {
      if (u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower)) {
        results.push({ id: u.id, name: u.name, type: 'user', href: `/admin/users/${u.id}` })
      }
    }
    for (const t of timesheets) {
      if (t.notes.toLowerCase().includes(lower) || t.projectId.toLowerCase().includes(lower)) {
        const project = projects.find((p) => p.id === t.projectId)
        results.push({ id: t.id, name: `${project?.name || 'Unknown'} - ${t.weekStart}`, type: 'timesheet', href: `/user/timesheets/${t.id}` })
      }
    }
    setSearchResults(results.slice(0, 10))
  }

  const handleLogout = async () => {
    await logout()
    addToast('success', 'Signed out successfully')
    navigate('/adminlog')
  }

  const recentNotifications = notifications.slice(0, 5)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleMobile}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <nav aria-label="Breadcrumb" className="hidden sm:flex">
          <ol className="flex items-center gap-2 text-sm">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <li key={index} className="flex items-center gap-2">
                  {index > 0 && <span className="text-slate-400">/</span>}
                  {isLast || !crumb.href ? (
                    <span className="font-medium text-slate-900" aria-current="page">
                      {crumb.label}
                    </span>
                  ) : (
                    <button type="button" onClick={() => navigate(crumb.href!)} className="text-slate-500 hover:text-indigo-600">
                      {crumb.label}
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div ref={searchRef} className="relative">
          <button
            type="button"
            onClick={() => setIsSearchOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-400 hover:border-slate-400 hover:text-slate-600"
            aria-label="Open search"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search projects, users...</span>
            <kbd className="ml-2 hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400 sm:inline-block">⌘K</kbd>
          </button>
          {isSearchOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg sm:w-80" role="search">
              <div className="p-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search projects, users, timesheets..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Search projects, users, timesheets"
                  autoFocus
                />
              </div>
              {searchResults.length > 0 && (
                <div className="max-h-80 overflow-y-auto border-t border-slate-200 p-2">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      type="button"
                      onClick={() => {
                        navigate(result.href)
                        setIsSearchOpen(false)
                        setSearchQuery('')
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-left hover:bg-slate-50"
                    >
                      {result.type === 'project' && <FolderKanban className="h-4 w-4 text-slate-400" />}
                      {result.type === 'user' && <User className="h-4 w-4 text-slate-400" />}
                      {result.type === 'timesheet' && <Clock3 className="h-4 w-4 text-slate-400" />}
                      <div className="min-w-0">
                        <p className="truncate text-slate-700">{result.name}</p>
                        <p className="text-xs text-slate-500">{result.type}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery && searchResults.length === 0 && (
                <div className="border-t border-slate-200 p-4 text-center text-sm text-slate-500">No results found</div>
              )}
            </div>
          )}
        </div>

        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
                {unreadCount}
              </span>
            )}
          </button>
          {isNotificationsOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-72 sm:w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await markAllAsRead()
                        addToast('success', 'All notifications marked as read')
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-700"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recentNotifications.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="No notifications" description="You're up to date." />
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {recentNotifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={async () => {
                          await markAsRead(notification.id)
                          if (notification.relatedId) {
                            const type = notification.type
                            const prefix = user?.role === 'admin' ? '/admin' : user?.isSupervisor ? '/supervisor' : '/user'
                            if (type === 'submission' || type === 'approval' || type === 'decline' || type === 'withdrawal') {
                              navigate(`${prefix}/submissions`)
                            } else if (type === 'deadline' || type === 'assignment') {
                              navigate(`${prefix}/projects`)
                            } else {
                              navigate(`${prefix}/submissions`)
                            }
                          }
                          setIsNotificationsOpen(false)
                        }}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 ${notification.read ? 'opacity-60' : 'bg-indigo-50/50'}`}
                      >
                        <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{notification.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{notification.message}</p>
                          <p className="mt-1 text-xs text-slate-400">{new Date(notification.createdAt).toLocaleDateString()}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-100"
            aria-label="User menu"
          >
            <Avatar name={user?.name || ''} size="sm" />
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>
          {isProfileOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
                <p className="text-xs text-slate-500">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsProfileOpen(false)
                  navigate(user?.role === 'admin' ? '/admin/settings' : '/user/settings')
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <User className="h-4 w-4" />
                Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsProfileOpen(false)
                  navigate(user?.role === 'admin' ? '/admin/settings' : '/user/settings')
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <div className="my-1 border-t border-slate-200" />
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
