import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AdminLogin } from './pages/auth/AdminLogin'
import { UserLogin } from './pages/auth/UserLogin'
import { Register } from './pages/auth/Register'
import { ResetPassword } from './pages/auth/ResetPassword'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { HomeRedirect } from './routes/HomeRedirect'
import { RedirectIfAuthenticated } from './routes/RedirectIfAuthenticated'
import { AppShellLayout } from './components/layout/AppShell'
import { AdminDashboard } from './pages/admin/Dashboard'
import { Projects } from './pages/admin/Projects'
import { CreateProject } from './pages/admin/CreateProject'
import { ProjectDetails } from './pages/admin/ProjectDetails'
import { EditProject } from './pages/admin/EditProject'
import { Users } from './pages/admin/Users'
import { CreateUser } from './pages/admin/CreateUser'
import { UserDetails } from './pages/admin/UserDetails'
import { EditUser } from './pages/admin/EditUser'
import { Supervisors } from './pages/admin/Supervisors'
import { SupervisorDetails } from './pages/admin/SupervisorDetails'
import { Onboarding } from './pages/admin/Onboarding'
import { InviteRedeem } from './pages/auth/InviteRedeem'
import { Timesheets } from './pages/admin/Timesheets'
import { Approvals } from './pages/admin/Approvals'
import { Reports } from './pages/admin/Reports'
import { Notifications as AdminNotifications } from './pages/admin/Notifications'
import { Settings as AdminSettings } from './pages/admin/Settings'
import { Invoices } from './pages/admin/Invoices'
import { InvoiceForm } from './pages/admin/InvoiceForm'
import { InvoiceDetail } from './pages/admin/InvoiceDetail'
import { Clients } from './pages/admin/Clients'
import { ClientDetails } from './pages/admin/ClientDetails'
import { UserDashboard } from './pages/user/Dashboard'
import { Projects as UserProjects } from './pages/user/Projects'
import { ProjectDetails as UserProjectDetails } from './pages/user/ProjectDetails'
import { Timesheets as UserTimesheets } from './pages/user/Timesheets'
import { TimesheetEditor as UserTimesheetEditor } from './pages/user/TimesheetEditor'
import { Submissions as UserSubmissions } from './pages/user/Submissions'
import { SubmissionDetails as UserSubmissionDetails } from './pages/user/SubmissionDetails'
import { Notifications as UserNotifications } from './pages/user/Notifications'
import { Settings as UserSettings } from './pages/user/Settings'
import { SupervisorTimesheets } from './pages/supervisor/Timesheets'
import { Approvals as SupervisorApprovals } from './pages/supervisor/Approvals'

// Data router (frontend_eval.md §12 items 1.2/1.3): createBrowserRouter
// replaces the declarative <Routes> tree 1:1 — same paths, elements, and role
// guards — but enables two guideline features the declarative router can't
// provide:
//   1. `useBlocker` for the unsaved-changes guard on the TimesheetEditor
//      (guideline 5.15), and
//   2. per-route `handle`s that AppShell reads via useMatches() to set an
//      accurate <title> (guideline 4.3).
const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect /> },
  {
    path: '/adminlog',
    element: (
      <RedirectIfAuthenticated>
        <AdminLogin />
      </RedirectIfAuthenticated>
    ),
    handle: { title: 'Admin Sign in' },
  },
  {
    path: '/userlog',
    element: (
      <RedirectIfAuthenticated>
        <UserLogin />
      </RedirectIfAuthenticated>
    ),
    handle: { title: 'Employee Sign in' },
  },
  {
    path: '/register',
    element: (
      <RedirectIfAuthenticated>
        <Register />
      </RedirectIfAuthenticated>
    ),
    handle: { title: 'Create account' },
  },
  {
    path: '/invite',
    element: (
      <RedirectIfAuthenticated>
        <InviteRedeem />
      </RedirectIfAuthenticated>
    ),
    handle: { title: 'Accept Invite' },
  },
  {
    path: '/reset-password',
    element: (
      <RedirectIfAuthenticated>
        <ResetPassword />
      </RedirectIfAuthenticated>
    ),
    handle: { title: 'Reset Password' },
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <AppShellLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: 'dashboard', element: <AdminDashboard />, handle: { title: 'Admin · Dashboard' } },
      { path: 'projects', element: <Projects />, handle: { title: 'Admin · Projects' } },
      { path: 'projects/new', element: <CreateProject />, handle: { title: 'Admin · New Project' } },
      { path: 'projects/:projectId', element: <ProjectDetails />, handle: { title: 'Admin · Project Details' } },
      { path: 'projects/:projectId/edit', element: <EditProject />, handle: { title: 'Admin · Edit Project' } },
      { path: 'users', element: <Users />, handle: { title: 'Admin · Users' } },
      { path: 'users/new', element: <CreateUser />, handle: { title: 'Admin · New User' } },
      { path: 'users/:userId', element: <UserDetails />, handle: { title: 'Admin · User Details' } },
      { path: 'users/:userId/edit', element: <EditUser />, handle: { title: 'Admin · Edit User' } },
      { path: 'supervisors', element: <Supervisors />, handle: { title: 'Admin · Supervisors' } },
      { path: 'onboarding', element: <Onboarding />, handle: { title: 'Admin · Onboarding' } },
      { path: 'supervisors/:userId', element: <SupervisorDetails />, handle: { title: 'Admin · Supervisor Details' } },
      { path: 'timesheets', element: <Timesheets />, handle: { title: 'Admin · Timesheets' } },
      { path: 'approvals', element: <Approvals />, handle: { title: 'Admin · Approvals' } },
      { path: 'reports', element: <Reports />, handle: { title: 'Admin · Reports' } },
      { path: 'notifications', element: <AdminNotifications />, handle: { title: 'Admin · Notifications' } },
      { path: 'settings', element: <AdminSettings />, handle: { title: 'Admin · Settings' } },
      { path: 'invoices', element: <Invoices />, handle: { title: 'Admin · Invoices' } },
      { path: 'invoices/new', element: <InvoiceForm />, handle: { title: 'Admin · New Invoice' } },
      { path: 'invoices/:invoiceId', element: <InvoiceDetail />, handle: { title: 'Admin · Invoice' } },
      { path: 'invoices/:invoiceId/form', element: <InvoiceForm />, handle: { title: 'Admin · Edit Invoice' } },
      { path: 'clients', element: <Clients />, handle: { title: 'Admin · Clients' } },
      { path: 'clients/:clientId', element: <ClientDetails />, handle: { title: 'Admin · Client Details' } },
    ],
  },
  {
    path: '/user',
    element: (
      <ProtectedRoute allowedRoles={['user']}>
        <AppShellLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: 'dashboard', element: <UserDashboard />, handle: { title: 'My Dashboard' } },
      { path: 'projects', element: <UserProjects />, handle: { title: 'My Projects' } },
      { path: 'projects/:projectId', element: <UserProjectDetails />, handle: { title: 'Project Details' } },
      { path: 'timesheets', element: <UserTimesheets />, handle: { title: 'My Timesheets' } },
      { path: 'timesheets/:timesheetId', element: <UserTimesheetEditor />, handle: { title: 'Timesheet Editor' } },
      { path: 'submissions', element: <UserSubmissions />, handle: { title: 'My Submissions' } },
      { path: 'submissions/:submissionId', element: <UserSubmissionDetails />, handle: { title: 'Submission Details' } },
      { path: 'notifications', element: <UserNotifications />, handle: { title: 'Notifications' } },
      { path: 'settings', element: <UserSettings />, handle: { title: 'My Settings' } },
    ],
  },
  {
    path: '/supervisor',
    element: (
      <ProtectedRoute allowedRoles={['user']} requireSupervisor>
        <AppShellLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: 'timesheets', element: <SupervisorTimesheets />, handle: { title: 'Supervisor · Team Timesheets' } },
      { path: 'approvals', element: <SupervisorApprovals />, handle: { title: 'Supervisor · Approvals' } },
    ],
  },
  { path: '*', element: <HomeRedirect /> },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
