import type { ReactNode } from 'react'
import {
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarOff,
  ClipboardCheck,
  Clock3,
  Contact,
  FileText,
  FolderKanban,
  IdCard,
  LayoutDashboard,
  Layers,
  ScrollText,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import type { UserRole } from '../../types/auth'
import type { CapabilityKey } from '../../utils/permissions'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'

/**
 * Role-scoped navigation for the shell (EMSFrontend.md §5.2, §14 Phase 2 2.6).
 *
 * One declarative registry feeds the Sidebar, the MobileNav drawer and the
 * CommandPalette's quick-nav commands, so a route change lands in all three
 * at once. Every item may declare the `capability` it needs — items whose
 * capability is false are filtered out, so no role ever sees a dead link
 * (§6.3: UI gates on capabilities, never raw role strings).
 */

export type NavSection =
  | 'workspace'
  | 'people'
  | 'commercial'
  | 'finance'
  | 'time'
  | 'insights'
  | 'system'
  | 'account'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  section: NavSection
  /** When present, the item renders only if the capability is granted. */
  capability?: CapabilityKey
}

export const SECTION_LABELS: Record<NavSection, string> = {
  workspace: 'WORKSPACE',
  people: 'PEOPLE',
  commercial: 'COMMERCIAL',
  finance: 'FINANCE',
  time: 'TIME',
  insights: 'INSIGHTS',
  system: 'SYSTEM',
  account: 'ACCOUNT',
}

/** Namespace prefix for a role (`/me` for employees, `/<role>` otherwise). */
export function namespaceForRole(role: UserRole): string {
  return role === 'employee' ? '/me' : `/${role}`
}

const adminNav: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, section: 'workspace' },
  { to: '/admin/attendance', label: 'Attendance', icon: <Clock3 className="h-5 w-5" />, section: 'workspace', capability: 'viewTeamAttendance' },
  { to: '/admin/employees', label: 'Employees', icon: <Users className="h-5 w-5" />, section: 'people', capability: 'viewAllEmployees' },
  { to: '/admin/roles', label: 'Roles & Access', icon: <ShieldCheck className="h-5 w-5" />, section: 'people', capability: 'manageUsers' },
  { to: '/admin/clients', label: 'Clients', icon: <Building2 className="h-5 w-5" />, section: 'commercial', capability: 'manageClients' },
  { to: '/admin/projects', label: 'Projects', icon: <FolderKanban className="h-5 w-5" />, section: 'commercial', capability: 'manageProjects' },
  { to: '/admin/assignments', label: 'Assignments', icon: <ClipboardCheck className="h-5 w-5" />, section: 'commercial', capability: 'manageAssignments' },
  { to: '/admin/payroll', label: 'Payroll', icon: <Wallet className="h-5 w-5" />, section: 'finance', capability: 'viewPayroll' },
  { to: '/admin/reports', label: 'Reports', icon: <FileText className="h-5 w-5" />, section: 'insights', capability: 'viewReports' },
  { to: '/admin/audit', label: 'Audit Log', icon: <ScrollText className="h-5 w-5" />, section: 'insights', capability: 'viewAuditLog' },
  { to: '/admin/notifications', label: 'Notifications', icon: <Bell className="h-5 w-5" />, section: 'system' },
  { to: '/admin/settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, section: 'system' },
]

const hrNav: NavItem[] = [
  { to: '/hr/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, section: 'workspace' },
  { to: '/hr/attendance', label: 'Attendance', icon: <Clock3 className="h-5 w-5" />, section: 'workspace', capability: 'viewTeamAttendance' },
  { to: '/hr/onboarding', label: 'Onboarding', icon: <UserPlus className="h-5 w-5" />, section: 'people', capability: 'onboardEmployee' },
  { to: '/hr/employees', label: 'Employees', icon: <Users className="h-5 w-5" />, section: 'people', capability: 'viewAllEmployees' },
  { to: '/hr/leave', label: 'Leave', icon: <CalendarOff className="h-5 w-5" />, section: 'people' },
  { to: '/hr/documents', label: 'Documents', icon: <IdCard className="h-5 w-5" />, section: 'people' },
  { to: '/hr/payroll', label: 'Pay Rates', icon: <Wallet className="h-5 w-5" />, section: 'finance', capability: 'viewPayroll' },
  { to: '/hr/reports', label: 'Reports', icon: <FileText className="h-5 w-5" />, section: 'insights', capability: 'viewReports' },
  { to: '/hr/notifications', label: 'Notifications', icon: <Bell className="h-5 w-5" />, section: 'system' },
  { to: '/hr/settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, section: 'system' },
]

const managerNav: NavItem[] = [
  { to: '/manager/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, section: 'workspace' },
  { to: '/manager/attendance', label: 'Attendance', icon: <Clock3 className="h-5 w-5" />, section: 'workspace', capability: 'viewTeamAttendance' },
  { to: '/manager/clients', label: 'Clients', icon: <Building2 className="h-5 w-5" />, section: 'commercial', capability: 'manageClients' },
  { to: '/manager/projects', label: 'Projects', icon: <FolderKanban className="h-5 w-5" />, section: 'commercial', capability: 'manageProjects' },
  { to: '/manager/assignments', label: 'Assignments', icon: <ClipboardCheck className="h-5 w-5" />, section: 'commercial', capability: 'manageAssignments' },
  { to: '/manager/resources', label: 'Resources', icon: <Layers className="h-5 w-5" />, section: 'people', capability: 'viewAllEmployees' },
  { to: '/manager/reports', label: 'Reports', icon: <FileText className="h-5 w-5" />, section: 'insights', capability: 'viewReports' },
  { to: '/manager/notifications', label: 'Notifications', icon: <Bell className="h-5 w-5" />, section: 'system' },
  { to: '/manager/settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, section: 'system' },
]

const employeeNav: NavItem[] = [
  { to: '/me/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, section: 'workspace' },
  { to: '/me/attendance', label: 'Attendance', icon: <Clock3 className="h-5 w-5" />, section: 'time', capability: 'viewOwnAttendance' },
  { to: '/me/schedule', label: 'Schedule', icon: <Calendar className="h-5 w-5" />, section: 'time' },
  { to: '/me/leave', label: 'Leave', icon: <CalendarCheck className="h-5 w-5" />, section: 'time' },
  { to: '/me/profile', label: 'Profile', icon: <Contact className="h-5 w-5" />, section: 'account' },
  { to: '/me/documents', label: 'Documents', icon: <IdCard className="h-5 w-5" />, section: 'account' },
  { to: '/me/notifications', label: 'Notifications', icon: <Bell className="h-5 w-5" />, section: 'system' },
  { to: '/me/settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, section: 'system' },
]

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  admin: adminNav,
  hr: hrNav,
  manager: managerNav,
  employee: employeeNav,
}

export function navForRole(role: UserRole): NavItem[] {
  return NAV_BY_ROLE[role]
}

/**
 * The current user's nav, filtered through their capability object (§2.6).
 * Returns `[]` while signed out — nav only renders inside the protected shell,
 * so the empty case only guards the last frame after logout.
 */
export function useRoleNav(): NavItem[] {
  const { user } = useAuth()
  const caps = usePermissions(user)
  if (!user) return []
  return navForRole(user.role).filter((item) => !item.capability || caps[item.capability])
}

