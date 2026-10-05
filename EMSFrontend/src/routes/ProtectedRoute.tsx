import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import type { UserRole } from '../types/auth'
import { dashboardPathFor } from '../utils/dashboardPath'

interface ProtectedRouteProps {
  children: ReactNode
  /** Roles allowed into this namespace (§5.1). Omit to allow any signed-in user. */
  allowedRoles?: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageSpinner />
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={dashboardPathFor(user.role)} replace />
  }

  return <>{children}</>
}
