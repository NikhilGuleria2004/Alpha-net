/**
 * Eniac EMS — Phase 2 route tree (EMSFrontend.md §5).
 *
 * `createBrowserRouter` replaces the Phase 1 placeholder so we get:
 *   1. per-route `handle: { title, breadcrumb }` read by AppShell via
 *      `useMatches()` for accurate `<title>` + breadcrumbs (§5.3), and
 *   2. `useBlocker` support for the unsaved-changes guards arriving later.
 *
 * Every namespace (§5.1) is wrapped in `ProtectedRoute` + `AppShellLayout`,
 * every leaf is a placeholder page (§14 Phase 2 2.7), and `/` + `*` resolve
 * through the role-aware `HomeRedirect` (gate: "404 → HomeRedirect").
 * Providers are mounted in `main.tsx` (§10); only Theme + Toast moved there
 * in Phase 1 — now the full Theme → Auth → Toast → AppData → Notification
 * stack.
 */
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom'
import { HomeRedirect } from './routes/HomeRedirect'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { RedirectIfAuthenticated } from './routes/RedirectIfAuthenticated'
import { AppShellLayout } from './components/layout/AppShell'
import { LoginPage } from './pages/auth/Login'
import { ResetPasswordPage } from './pages/auth/ResetPassword'
import { InviteRedeemPage } from './pages/auth/InviteRedeem'
import { AttendancePage } from './pages/attendance/AttendancePage'
import { AdminDashboard } from './pages/admin/Dashboard'
import { HrDashboard } from './pages/hr/Dashboard'
import { HrOnboardingPipeline } from './pages/hr/OnboardingPipeline'
import { HrOnboardingWizard } from './pages/hr/OnboardingWizard'
import { HrEmployeesDirectory } from './pages/hr/EmployeesDirectory'
import { HrEmployeeDetail } from './pages/hr/EmployeeDetail'
import { HrEmployeeEdit } from './pages/hr/EmployeeEdit'
import { HrPayrateManagement } from './pages/hr/PayrateManagement'
import { HrLeaveList } from './pages/hr/LeaveList'
import { HrDocumentsList } from './pages/hr/DocumentsList'
import { ManagerDashboard } from './pages/manager/Dashboard'
import { ManagerClientsPage } from './pages/manager/Clients'
import { ManagerClientNewPage } from './pages/manager/ClientNew'
import { ManagerClientDetailPage } from './pages/manager/ClientDetail'
import { ManagerProjectsPage } from './pages/manager/Projects'
import { ManagerProjectNewPage } from './pages/manager/ProjectNew'
import { ManagerProjectDetailPage } from './pages/manager/ProjectDetail'
import { ManagerAssignmentsPage } from './pages/manager/Assignments'
import { EmployeeDashboard } from './pages/me/Dashboard'
import { MyLeavePage } from './pages/me/Leave'
import { MyDocumentsPage } from './pages/me/Documents'
import { AdminPayrollPage } from './pages/admin/Payroll'
import { AdminRolesPage } from './pages/admin/Roles'
import { AdminReportsPage } from './pages/admin/Reports'
import { NotificationsPage } from './pages/shared/NotificationsPage'
import { SettingsPage } from './pages/shared/SettingsPage'
import { RoutePlaceholder } from './pages/RoutePlaceholder'
import { DesignSystemPage } from './pages/DesignSystemPage'
import type { EmsHandle } from './types/router'
import type { UserRole } from './types/auth'
import type { ReactNode } from 'react'

const P6 = 'Phase 6 (Manager: clients, projects, assignments)'
const P7 = 'Phase 7 (Finance, reports, notifications, settings)'

const inPhase = (phase: string) => `Arrives in ${phase} — see EMSFrontend.md §14.`

interface PageOptions {
  /** Namespace label used for the document title (`Admin · Employees`). */
  ns: string
  /** Breadcrumb label when it differs from the heading (detail routes). */
  crumb?: string
  /** Placeholder note — which phase delivers the real screen. */
  note?: string
  /** Real route element; when omitted renders {@link RoutePlaceholder}. */
  element?: ReactNode
}

/** A child route carrying its `handle` (§5.3). Falls back to a placeholder. */
function page(path: string, heading: string, { ns, crumb, note, element }: PageOptions): RouteObject {
  return {
    path,
    element: element ?? <RoutePlaceholder title={heading} note={note} />,
    handle: { title: `${ns} · ${heading}`, breadcrumb: crumb ?? heading } satisfies EmsHandle,
  }
}

/**
 * A role namespace: guard → shell → children, with an index redirect to the
 * role dashboard so `/admin` (etc.) always resolves.
 */
function namespace(path: string, allowedRoles: UserRole[], crumb: string, children: RouteObject[]): RouteObject {
  return {
    path,
    element: (
      <ProtectedRoute allowedRoles={allowedRoles}>
        <AppShellLayout />
      </ProtectedRoute>
    ),
    handle: { title: crumb, breadcrumb: crumb } satisfies EmsHandle,
    children: [{ index: true, element: <Navigate to="dashboard" replace /> }, ...children],
  }
}

const routes: RouteObject[] = [
  { path: '/', element: <HomeRedirect /> },
  {
    path: '/login',
    element: (
      <RedirectIfAuthenticated>
        <LoginPage />
      </RedirectIfAuthenticated>
    ),
    handle: { title: 'Sign in', breadcrumb: 'Sign in' } satisfies EmsHandle,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
    handle: { title: 'Reset Password', breadcrumb: 'Reset Password' } satisfies EmsHandle,
  },
  {
    path: '/onboarding/:token',
    element: <InviteRedeemPage />,
    handle: { title: 'Set Up Your Account', breadcrumb: 'Accept Invite' } satisfies EmsHandle,
  },
  namespace('/admin', ['admin'], 'Admin', [
    page('dashboard', 'Dashboard', { ns: 'Admin', element: <AdminDashboard /> }),
    // Employee management is implemented once (src/pages/hr) and served under
    // both namespaces so an admin's URLs stay under /admin/* like every other
    // admin page. Same components, no duplicated logic. See D-22.
    page('employees', 'Employees', { ns: 'Admin', element: <HrEmployeesDirectory /> }),
    page('employees/:id', 'Employee Detail', { ns: 'Admin', crumb: 'Employee', element: <HrEmployeeDetail /> }),
    page('employees/:id/edit', 'Edit Employee', { ns: 'Admin', crumb: 'Edit', element: <HrEmployeeEdit /> }),
    page('attendance', 'Attendance', { ns: 'Admin', element: <AttendancePage /> }),
    page('clients', 'Clients', { ns: 'Admin', element: <ManagerClientsPage /> }),
    page('clients/:id', 'Client Detail', { ns: 'Admin', crumb: 'Client', element: <ManagerClientDetailPage /> }),
    page('projects', 'Projects', { ns: 'Admin', element: <ManagerProjectsPage /> }),
    page('projects/:id', 'Project Detail', { ns: 'Admin', crumb: 'Project', element: <ManagerProjectDetailPage /> }),
    page('assignments', 'Assignments', { ns: 'Admin', element: <ManagerAssignmentsPage /> }),
    page('payroll', 'Payroll', { ns: 'Admin', element: <AdminPayrollPage /> }),
    page('reports', 'Reports', { ns: 'Admin', element: <AdminReportsPage /> }),
    page('roles', 'Roles & Access', { ns: 'Admin', element: <AdminRolesPage /> }),
    page('audit', 'Audit Log', { ns: 'Admin', note: inPhase(P7) }),
    page('settings', 'Settings', { ns: 'Admin', element: <SettingsPage /> }),
    page('notifications', 'Notifications', { ns: 'Admin', element: <NotificationsPage /> }),
  ]),
  namespace('/hr', ['hr', 'admin'], 'HR', [
    page('dashboard', 'Dashboard', { ns: 'HR', element: <HrDashboard /> }),
    page('onboarding', 'Onboarding Pipeline', { ns: 'HR', element: <HrOnboardingPipeline /> }),
    page('onboarding/new', 'New Hire Wizard', { ns: 'HR', crumb: 'New Hire', element: <HrOnboardingWizard /> }),
    page('employees', 'Employees', { ns: 'HR', element: <HrEmployeesDirectory /> }),
    page('employees/:id', 'Employee Detail', { ns: 'HR', crumb: 'Employee', element: <HrEmployeeDetail /> }),
    page('employees/:id/edit', 'Edit Employee', { ns: 'HR', crumb: 'Edit', element: <HrEmployeeEdit /> }),
    page('payroll', 'Pay Rates', { ns: 'HR', element: <HrPayrateManagement /> }),
    page('attendance', 'Attendance', { ns: 'HR', element: <AttendancePage /> }),
    page('leave', 'Leave', { ns: 'HR', element: <HrLeaveList /> }),
    page('documents', 'Documents', { ns: 'HR', element: <HrDocumentsList /> }),
    page('reports', 'Reports', { ns: 'HR', element: <AdminReportsPage /> }),
    page('settings', 'Settings', { ns: 'HR', element: <SettingsPage /> }),
    page('notifications', 'Notifications', { ns: 'HR', element: <NotificationsPage /> }),
  ]),
  namespace('/manager', ['manager'], 'Manager', [
    page('dashboard', 'Dashboard', { ns: 'Manager', element: <ManagerDashboard /> }),
    page('clients', 'Clients', { ns: 'Manager', element: <ManagerClientsPage /> }),
    page('clients/new', 'New Client', { ns: 'Manager', crumb: 'New Client', element: <ManagerClientNewPage /> }),
    page('clients/:id', 'Client Detail', { ns: 'Manager', crumb: 'Client', element: <ManagerClientDetailPage /> }),
    page('projects', 'Projects', { ns: 'Manager', element: <ManagerProjectsPage /> }),
    page('projects/new', 'New Project', { ns: 'Manager', crumb: 'New Project', element: <ManagerProjectNewPage /> }),
    page('projects/:id', 'Project Detail', { ns: 'Manager', crumb: 'Project', element: <ManagerProjectDetailPage /> }),
    page('assignments', 'Assignments', { ns: 'Manager', element: <ManagerAssignmentsPage /> }),
    page('assignments/new', 'New Assignment', { ns: 'Manager', crumb: 'New Assignment', element: <ManagerAssignmentsPage /> }),
    page('resources', 'Resources', { ns: 'Manager', note: inPhase(P6) }),
    page('attendance', 'Attendance', { ns: 'Manager', element: <AttendancePage /> }),
    page('reports', 'Reports', { ns: 'Manager', element: <AdminReportsPage /> }),
    page('settings', 'Settings', { ns: 'Manager', element: <SettingsPage /> }),
    page('notifications', 'Notifications', { ns: 'Manager', element: <NotificationsPage /> }),
  ]),
  // §5.1: `/me` is the employee namespace and the landing surface for every
  // non-admin role too (own profile, leave, documents live here for all).
  namespace('/me', ['employee', 'hr', 'manager'], 'My Workspace', [
    page('dashboard', 'Dashboard', { ns: 'Me', element: <EmployeeDashboard /> }),
    page('attendance', 'My Attendance', { ns: 'Me', element: <AttendancePage /> }),
    page('profile', 'My Profile', { ns: 'Me', note: inPhase(P7) }),
    page('schedule', 'My Schedule', { ns: 'Me', note: 'Arrives in a later phase — see EMSFrontend.md §14.' }),
    page('leave', 'My Leave', { ns: 'Me', element: <MyLeavePage /> }),
    page('documents', 'My Documents', { ns: 'Me', element: <MyDocumentsPage /> }),
    page('settings', 'My Settings', { ns: 'Me', element: <SettingsPage /> }),
    page('notifications', 'Notifications', { ns: 'Me', element: <NotificationsPage /> }),
  ]),
  // DEV-only component playground — absent from the production bundle.
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/components',
          element: <DesignSystemPage />,
          handle: { title: 'Component Playground', breadcrumb: 'Playground' } satisfies EmsHandle,
        } satisfies RouteObject,
      ]
    : []),
  // Gate: unknown routes fall through to the role-aware HomeRedirect.
  { path: '*', element: <HomeRedirect /> },
]

const router = createBrowserRouter(routes)

function App() {
  return <RouterProvider router={router} />
}

export default App


