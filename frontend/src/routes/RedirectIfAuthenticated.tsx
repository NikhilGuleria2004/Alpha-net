import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import { dashboardPathFor } from './HomeRedirect'

// QA A13: the public auth pages (/adminlog, /userlog, /register) previously
// rendered even for users with a live session. Anyone landing here already
// authenticated (bookmark, back-navigation after reopening the app) is now
// forwarded to their role dashboard instead of being shown a login form.
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return <FullPageSpinner />
  if (isAuthenticated && user) return <Navigate to={dashboardPathFor(user.role)} replace />
  return <>{children}</>
}