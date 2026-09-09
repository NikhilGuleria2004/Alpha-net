import { type ReactNode, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LayoutDashboard, FolderKanban, Users, UserCheck, Clock3, ClipboardCheck, FileText, Bell, Settings, ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react'
import { Avatar } from '../ui/Avatar'

type SectionKey = 'workspace' | 'time' | 'insights' | 'system' | 'work' | 'supervisor'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  section: SectionKey
}

interface SidebarProps {
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

const adminNavItems: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, section: 'workspace' },
  { to: '/admin/projects', label: 'Projects', icon: <FolderKanban className="h-5 w-5" />, section: 'workspace' },
  { to: '/admin/users', label: 'Users', icon: <Users className="h-5 w-5" />, section: 'workspace' },
  { to: '/admin/supervisors', label: 'Supervisors', icon: <UserCheck className="h-5 w-5" />, section: 'workspace' },
  { to: '/admin/timesheets', label: 'Timesheets', icon: <Clock3 className="h-5 w-5" />, section: 'time' },
  { to: '/admin/approvals', label: 'Approvals', icon: <ClipboardCheck className="h-5 w-5" />, section: 'time' },
  { to: '/admin/reports', label: 'Reports', icon: <FileText className="h-5 w-5" />, section: 'insights' },
  { to: '/admin/notifications', label: 'Notifications', icon: <Bell className="h-5 w-5" />, section: 'system' },
  { to: '/admin/settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, section: 'system' },
]

const userNavItems: NavItem[] = [
  { to: '/user/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, section: 'work' },
  { to: '/user/projects', label: 'My Projects', icon: <FolderKanban className="h-5 w-5" />, section: 'work' },
  { to: '/user/timesheets', label: 'My Timesheets', icon: <Clock3 className="h-5 w-5" />, section: 'work' },
  { to: '/user/submissions', label: 'Submissions', icon: <ClipboardCheck className="h-5 w-5" />, section: 'work' },
  { to: '/supervisor/timesheets', label: 'Team Timesheets', icon: <Users className="h-5 w-5" />, section: 'supervisor' },
  { to: '/supervisor/approvals', label: 'Approvals', icon: <ClipboardCheck className="h-5 w-5" />, section: 'supervisor' },
  { to: '/user/notifications', label: 'Notifications', icon: <Bell className="h-5 w-5" />, section: 'system' },
  { to: '/user/settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, section: 'system' },
]

const sectionLabels: Record<SectionKey, string> = {
  workspace: 'WORKSPACE',
  time: 'TIME',
  insights: 'INSIGHTS',
  system: 'SYSTEM',
  work: 'WORK',
  supervisor: 'SUPERVISOR',
}

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navItems = user?.role === 'admin' ? adminNavItems : userNavItems
  const filteredNavItems = user?.role === 'user' && !user.isSupervisor
    ? navItems.filter((item) => item.section !== 'supervisor')
    : navItems

  const grouped = filteredNavItems.reduce<Record<SectionKey, NavItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = []
    acc[item.section].push(item)
    return acc
  }, {} as Record<SectionKey, NavItem[]>)

  const handleLogout = async () => {
    await logout()
    onMobileClose?.()
    navigate('/adminlog')
  }

  return (
    <>
      <aside
        className={`hidden md:flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <span className="text-sm font-bold">A</span>
              </div>
              <span className="text-lg font-semibold text-slate-900">Eniac</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section} className="mb-4">
              {!isCollapsed && (
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {sectionLabels[section as SectionKey]}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item) => {
                  const isActive = location.pathname.startsWith(item.to)
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title={isCollapsed ? item.label : undefined}
                      >
                        <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>{item.icon}</span>
                        {!isCollapsed && <span>{item.label}</span>}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
            <Avatar name={user?.name || ''} size="sm" />
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          )}
        </div>
      </aside>

      <div
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity md:hidden ${isMobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-xl transition-transform duration-300 md:hidden ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <span className="text-sm font-bold">A</span>
            </div>
            <span className="text-lg font-semibold text-slate-900">Eniac</span>
          </div>
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="overflow-y-auto px-2 py-4">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section} className="mb-4">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {sectionLabels[section as SectionKey]}
              </p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const isActive = location.pathname.startsWith(item.to)
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onMobileClose}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>{item.icon}</span>
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={user?.name || ''} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
