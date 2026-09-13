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
  const data = await apiClient.patch<{ settings: OrgSettings }>('/settings', {
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