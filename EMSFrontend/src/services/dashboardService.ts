/**
 * Dashboard aggregate service (EMSFrontend.md §7.3, §9.3).
 *
 * One aggregate per role endpoint keeps dashboard FMP requests ≤ 3 (§12 budget).
 * All calls go through the `api` switch so mock↔real is a single flag.
 */
import { api } from './apiClient'
import type {
  AdminDashboardData,
  HrDashboardData,
  ManagerDashboardData,
  EmployeeDashboardData,
} from '../types/dashboard'

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  return api.get<AdminDashboardData>('/dashboard/admin')
}

export async function getHrDashboard(): Promise<HrDashboardData> {
  return api.get<HrDashboardData>('/dashboard/hr')
}

export async function getManagerDashboard(): Promise<ManagerDashboardData> {
  return api.get<ManagerDashboardData>('/dashboard/manager')
}

export async function getEmployeeDashboard(): Promise<EmployeeDashboardData> {
  return api.get<EmployeeDashboardData>('/dashboard/employee')
}
