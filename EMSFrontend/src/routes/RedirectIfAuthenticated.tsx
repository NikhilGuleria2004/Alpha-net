import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import { dashboardPathFor } from '../utils/dashboardPath'

/**
 * `/login` gate (EMSFrontend.md §5.3): anyone landing here already
 * authenticated (bookmark, back-navigation after reopening the app) is
 * forwarded to their role dashboard instead of seeing a sign-in form.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return <FullPageSpinner />
  if (isAuthenticated && user) return <Navigate to={dashboardPathFor(user.role)} replace />
  return <>{children}</>
}
