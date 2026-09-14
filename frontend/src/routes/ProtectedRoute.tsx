import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: Array<'admin' | 'user'>
  requireSupervisor?: boolean
}

export function ProtectedRoute({ children, allowedRoles, requireSupervisor }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageSpinner />
  }

  if (!isAuthenticated || !user) {
    const loginRoute = location.pathname.startsWith('/admin') ? '/adminlog' : '/userlog'
    return <Navigate to={loginRoute} state={{ from: location }} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const fallback = user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard'
    return <Navigate to={fallback} replace />
  }

  if (requireSupervisor && !user.isSupervisor) {
    const fallback = user.role === 'admin' ? '/admin/dashboard' : '/user/dashboard'
    return <Navigate to={fallback} replace />
  }

  return <>{children}</>
}
