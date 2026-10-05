import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useUiStore } from '../../stores/uiStore'
import { Avatar } from '../ui/Avatar'
import { SECTION_LABELS, useRoleNav, type NavItem, type NavSection } from './nav'

/**
 * Desktop sidebar (EMSFrontend.md §14 Phase 2 2.2): role nav grouped into
 * SECTION blocks, collapsible (state in `uiStore`), every item filtered
 * through the capability model so no role sees a dead link (2.6). Mobile
 * navigation lives in `MobileNav`, fed from the same `nav.tsx` registry.
 */
export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const navItems = useRoleNav()
  const isCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const grouped = navItems.reduce<Partial<Record<NavSection, NavItem[]>>>((acc, item) => {
    (acc[item.section] ??= []).push(item)
    return acc
  }, {})

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      navigate('/login')
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <aside
      className={`relative z-40 hidden shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="relative overflow-visible border-b border-border px-3 py-4">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
              <span className="text-sm font-bold">E</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">Eniac EMS</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.department || 'Workspace'}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <span className="text-sm font-bold">E</span>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!isCollapsed)}
          className="absolute -right-3 top-1/2 z-40 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Main">
        {Object.entries(grouped).map(([section, items]) => (
          <div key={section} className="mb-4">
            {!isCollapsed && (
              <p className="ems-overline mb-2 px-2 text-muted-foreground">{SECTION_LABELS[section as NavSection]}</p>
            )}
            <ul className="space-y-1">
              {items.map((item) => {
                const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        isActive
                          ? 'bg-accent-soft text-accent'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      } focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <span className={isActive ? 'text-accent' : 'text-muted-foreground'}>{item.icon}</span>
                      {!isCollapsed && <span>{item.label}</span>}
                      {isCollapsed && <span className="sr-only">{item.label}</span>}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
          <Avatar name={user?.name || ''} size="sm" />
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.title || user?.role}</p>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {isLoggingOut ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        )}
      </div>
    </aside>
  )
}
