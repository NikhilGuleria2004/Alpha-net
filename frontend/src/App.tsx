import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AdminLogin } from './pages/auth/AdminLogin'
import { UserLogin } from './pages/auth/UserLogin'
import { ProtectedRoute } from './routes/ProtectedRoute'
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
import { Timesheets } from './pages/admin/Timesheets'
import { Approvals } from './pages/admin/Approvals'
import { Reports } from './pages/admin/Reports'
import { Notifications as AdminNotifications } from './pages/admin/Notifications'
import { Settings as AdminSettings } from './pages/admin/Settings'
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/adminlog" replace />} />
        <Route path="/adminlog" element={<AdminLogin />} />
        <Route path="/userlog" element={<UserLogin />} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AppShellLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/new" element={<CreateProject />} />
          <Route path="projects/:projectId" element={<ProjectDetails />} />
          <Route path="projects/:projectId/edit" element={<EditProject />} />
          <Route path="users" element={<Users />} />
          <Route path="users/new" element={<CreateUser />} />
          <Route path="users/:userId" element={<UserDetails />} />
          <Route path="users/:userId/edit" element={<EditUser />} />
          <Route path="supervisors" element={<Supervisors />} />
          <Route path="supervisors/:userId" element={<SupervisorDetails />} />
          <Route path="timesheets" element={<Timesheets />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="reports" element={<Reports />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route
          path="/user"
          element={
            <ProtectedRoute allowedRoles={['user']}>
              <AppShellLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<UserDashboard />} />
          <Route path="projects" element={<UserProjects />} />
          <Route path="projects/:projectId" element={<UserProjectDetails />} />
          <Route path="timesheets" element={<UserTimesheets />} />
          <Route path="timesheets/:timesheetId" element={<UserTimesheetEditor />} />
          <Route path="submissions" element={<UserSubmissions />} />
          <Route path="submissions/:submissionId" element={<UserSubmissionDetails />} />
          <Route path="notifications" element={<UserNotifications />} />
          <Route path="settings" element={<UserSettings />} />
        </Route>

        <Route
          path="/supervisor"
          element={
            <ProtectedRoute allowedRoles={['user']} requireSupervisor>
              <AppShellLayout />
            </ProtectedRoute>
          }
        >
          <Route path="timesheets" element={<SupervisorTimesheets />} />
          <Route path="approvals" element={<SupervisorApprovals />} />
        </Route>

        <Route path="*" element={<Navigate to="/adminlog" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
