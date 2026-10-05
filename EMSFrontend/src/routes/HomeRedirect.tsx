import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import { dashboardPathFor } from '../utils/dashboardPath'

/**
 * `/` and the `*` fallback (EMSFrontend.md §5.1, §14 Phase 2 gate): wait for
 * the auth restore, then route by role — logged-out visitors still get the
 * login page, so a stale deep link can never flash the wrong dashboard.
 * Role → dashboard mapping lives in `utils/dashboardPath`.
 */
export function HomeRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return <FullPageSpinner />
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />
  return <Navigate to={dashboardPathFor(user.role)} replace />
}
