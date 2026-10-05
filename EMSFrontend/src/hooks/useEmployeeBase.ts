import { useLocation } from 'react-router-dom'

/**
 * Base path for employee drill-down navigation, resolved from the *current*
 * namespace.
 *
 * Employee management is served at both `/hr/employees` and
 * `/admin/employees` so an admin's URLs stay under `/admin/*` like every other
 * admin page (D-22). The pages were originally written with `/hr/employees`
 * hardcoded, so without this an admin would be redirected to `/admin/employees`
 * and then bounced straight back to `/hr/employees/:id` on the first click.
 *
 * Returns `/admin/employees` while the user is anywhere under `/admin`,
 * otherwise `/hr/employees`. Only employee-to-employee navigation uses this;
 * links to sections that exist solely under `/hr` (onboarding, leave,
 * documents) keep pointing there.
 */
export function useEmployeeBase(): string {
  const { pathname } = useLocation()
  return pathname.startsWith('/admin') ? '/admin/employees' : '/hr/employees'
}
