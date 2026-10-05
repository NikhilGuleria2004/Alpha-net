import type { UserRole } from '../types/auth'

/**
 * Where each role lands (EMSFrontend.md §5.3). Single source of truth for
 * role → dashboard: `HomeRedirect`, `ProtectedRoute`, `RedirectIfAuthenticated`
 * and the login page all resolve through this, so a namespace remodel touches
 * one function. Lives outside the guard components so each file exports a
 * single kind of symbol (fast-refresh + lint clean).
 */
export function dashboardPathFor(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard'
    case 'hr':
      return '/hr/dashboard'
    case 'manager':
      return '/manager/dashboard'
    case 'employee':
    default:
      return '/me/dashboard'
  }
}
