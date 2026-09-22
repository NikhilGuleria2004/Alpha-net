import { type ReactNode, useState } from 'react'
import { Outlet, useMatches } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { AIChatWidget } from '../ai/AIChatWidget'
import { usePageTitle } from '../../hooks/usePageTitle'

interface AppShellProps {
  children?: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const matches = useMatches()

  // Guideline 4.3 (checklist item 1.3): the <title> reflects the current
  // context. Titles come from route `handle`s defined in App.tsx; the deepest
  // match with a handle wins, and usePageTitle appends the app name.
  const leafMatch = [...matches]
    .reverse()
    .find((match) => Boolean((match.handle as { title?: string } | undefined)?.title))
  usePageTitle((leafMatch?.handle as { title?: string } | undefined)?.title)

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Sidebar isMobileOpen={isMobileOpen} onMobileClose={() => setIsMobileOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onToggleMobile={() => setIsMobileOpen((prev) => !prev)} />
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="w-full px-4 py-6 sm:px-6">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
      {/* Checklist item 1.1: the AI assistant is live — floating trigger +
          Ctrl/⌘+Shift+A shortcut, focus-managed panel (see AIChatPanel). */}
      <AIChatWidget />
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
