import { apiClient } from './apiClient'
import type { DayKey } from '../types/project'

export interface OrgSettings {
  orgKey: string
  companyName: string
  timezone: string
  weeklyStartDay: DayKey
  workdays: string[]
  standardWeeklyHours: number
  weekendOvertimeEnabled: boolean
  updatedAt: string
}

export interface UserNotificationPrefs {
  userId: string
  submissionNotifications: boolean
  deadlineReminders: boolean
  approvalNotifications: boolean
  updatedAt: string
}

export async function getOrgSettings(): Promise<OrgSettings> {
  const data = await apiClient.get<{ settings: OrgSettings }>('/settings')
  return data.settings
}

export async function putOrgSettings(
  patch: Partial<Omit<OrgSettings, 'orgKey' | 'updatedAt'>>,
): Promise<OrgSettings> {
  // QA A1: this was apiClient.patch — but the backend mounts org settings as
  // PUT only (routes/settings.ts), so every save from the admin Settings page
  // 404'd. The page could load defaults but never persist an update.
  const data = await apiClient.put<{ settings: OrgSettings }>('/settings', {
    ...patch,
    standardWeeklyHours:
      typeof patch.standardWeeklyHours === 'string'
        ? Number(patch.standardWeeklyHours)
        : patch.standardWeeklyHours,
  })
  return data.settings
}

export async function getMyNotificationPrefs(): Promise<UserNotificationPrefs> {
  const data = await apiClient.get<{ prefs: UserNotificationPrefs }>('/settings/me/notification-prefs')
  return data.prefs
}

export async function putMyNotificationPrefs(
  patch: Partial<Omit<UserNotificationPrefs, 'userId' | 'updatedAt'>>,
): Promise<UserNotificationPrefs> {
  const data = await apiClient.put<{ prefs: UserNotificationPrefs }>('/settings/me/notification-prefs', patch)
  return data.prefs
}

// QA M4: self-service profile update. PATCH /users/me — a user can change
// their own name, email, employee ID and department. Restricted schema on the
// backend omits role/status/isSupervisor/supervisorId/password, which remain
// admin-only via PATCH /users/:id.
export interface UpdateMyProfileInput {
  name?: string
  email?: string
  employeeId?: string
  department?: string
}

export async function updateMyProfile(patch: UpdateMyProfileInput): Promise<void> {
  await apiClient.patch('/users/me', patch)
}