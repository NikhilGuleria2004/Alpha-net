import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'

// QA A13: the dashboard path mirrors ProtectedRoute's fallback — admins land
// on the admin portal, everyone else (supervisors included) on the user one.
export function dashboardPathFor(role: 'admin' | 'user'): string {
  return role === 'admin' ? '/admin/dashboard' : '/user/dashboard'
}

// QA A13: `/` and the `*` fallback used to <Navigate to="/adminlog">
// unconditionally, so a user with a live session (persistent httpOnly refresh
// cookie) who reopened the app was dumped on the login page even though the
// session restored fine. This gate waits for the auth restore, then routes by
// role — logged-out visitors still get the login page.
export function HomeRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) return <FullPageSpinner />
  if (!isAuthenticated || !user) return <Navigate to="/adminlog" replace />
  return <Navigate to={dashboardPathFor(user.role)} replace />
}