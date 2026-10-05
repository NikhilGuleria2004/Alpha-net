import { type ReactNode, useMemo, useState } from 'react'
import { Outlet, useMatches } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { MobileNav, MobileNavItem } from './MobileNav'
import { CommandPaletteHost } from './CommandPaletteHost'
import { SECTION_LABELS, useRoleNav, type NavSection } from './nav'
import { usePageTitle } from '../../hooks/usePageTitle'
import { AttendanceBanner } from '../attendance/AttendanceBanner'

interface AppShellProps {
  children?: ReactNode
}

/**
 * The protected application frame (EMSFrontend.md §14 Phase 2 2.2): skip
 * link → sidebar (desktop) / MobileNav drawer (mobile) / topbar → `<main>`.
 * Page titles come from route `handle.title`s via `useMatches` (guide
 * "Accurate page titles"); the Cmd/Ctrl+K palette host lives here so the
 * keybinding works on every authenticated screen.
 */
export function AppShell({ children }: AppShellProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const matches = useMatches()
  const navItems = useRoleNav()

  const leafMatch = [...matches]
    .reverse()
    .find((match) => Boolean((match.handle as { title?: string } | undefined)?.title))
  usePageTitle((leafMatch?.handle as { title?: string } | undefined)?.title)

  const mobileGroups = useMemo(() => {
    const grouped: Partial<Record<NavSection, typeof navItems>> = {}
    for (const item of navItems) {
      ;(grouped[item.section] ??= []).push(item)
    }
    return Object.entries(grouped)
  }, [navItems])

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onToggleMobile={() => setIsMobileOpen((prev) => !prev)} />
        <AttendanceBanner />
        <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
          <div className="w-full px-4 py-6 sm:px-6">{children ?? <Outlet />}</div>
        </main>
      </div>

      <MobileNav isOpen={isMobileOpen} onClose={() => setIsMobileOpen(false)}>
        {mobileGroups.map(([section, items]) => (
          <li key={section} className="mb-3">
            <p className="ems-overline px-3 pb-1 pt-2 text-muted-foreground">
              {SECTION_LABELS[section as NavSection]}
            </p>
            <ul className="space-y-1">
              {items.map((item) => (
                <MobileNavItem key={item.to} to={item.to} icon={item.icon} onNavigate={() => setIsMobileOpen(false)}>
                  {item.label}
                </MobileNavItem>
              ))}
            </ul>
          </li>
        ))}
      </MobileNav>

      <CommandPaletteHost />
    </div>
  )
}

export function AppShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
