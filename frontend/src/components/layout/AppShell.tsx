import { type ReactNode, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
// import { AIChatWidget } from '../ai/AIChatWidget'

interface AppShellProps {
  children?: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)

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
      {/* <AIChatWidget /> */}
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
