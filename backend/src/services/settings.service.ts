import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'

export interface OrgSettings {
  orgKey: string
  companyName: string
  timezone: string
  weeklyStartDay: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
  workdays: string[]
  standardWeeklyHours: number
  weekendOvertimeEnabled: boolean
  updatedAt: Date
}

export interface UserNotificationPrefs {
  userId: string
  submissionNotifications: boolean
  deadlineReminders: boolean
  approvalNotifications: boolean
  updatedAt: Date
}

const ORG_KEY = 'default'

const DEFAULT_ORG_SETTINGS: OrgSettings = {
  orgKey: ORG_KEY,
  companyName: 'Eniac',
  timezone: 'America/New_York',
  weeklyStartDay: 'mon',
  workdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  standardWeeklyHours: 40,
  weekendOvertimeEnabled: true,
  updatedAt: new Date(),
}

export async function getOrgSettings(): Promise<OrgSettings> {
  const db = await getDb()
  const col = db.collection(COLLECTIONS.SETTINGS)
  const doc = await col.findOne({ orgKey: ORG_KEY })
  if (!doc) {
    await col.insertOne({ ...DEFAULT_ORG_SETTINGS })
    return { ...DEFAULT_ORG_SETTINGS }
  }
  return {
    orgKey: doc.orgKey,
    companyName: doc.companyName,
    timezone: doc.timezone,
    weeklyStartDay: doc.weeklyStartDay,
    workdays: doc.workdays,
    standardWeeklyHours: doc.standardWeeklyHours,
    weekendOvertimeEnabled: doc.weekendOvertimeEnabled,
    updatedAt: doc.updatedAt,
  }
}

export async function updateOrgSettings(
  patch: Partial<Omit<OrgSettings, 'orgKey' | 'updatedAt'>>,
): Promise<OrgSettings> {
  const db = await getDb()
  const col = db.collection(COLLECTIONS.SETTINGS)
  const updatedAt = new Date()
  const existing = await col.findOne({ orgKey: ORG_KEY })
  const next: OrgSettings = {
    orgKey: ORG_KEY,
    companyName: patch.companyName ?? existing?.companyName ?? DEFAULT_ORG_SETTINGS.companyName,
    timezone: patch.timezone ?? existing?.timezone ?? DEFAULT_ORG_SETTINGS.timezone,
    weeklyStartDay: patch.weeklyStartDay ?? existing?.weeklyStartDay ?? DEFAULT_ORG_SETTINGS.weeklyStartDay,
    workdays: patch.workdays ?? existing?.workdays ?? DEFAULT_ORG_SETTINGS.workdays,
    standardWeeklyHours: patch.standardWeeklyHours ?? existing?.standardWeeklyHours ?? DEFAULT_ORG_SETTINGS.standardWeeklyHours,
    weekendOvertimeEnabled:
      patch.weekendOvertimeEnabled ?? existing?.weekendOvertimeEnabled ?? DEFAULT_ORG_SETTINGS.weekendOvertimeEnabled,
    updatedAt,
  }
  await col.updateOne(
    { orgKey: ORG_KEY },
    { $set: next },
    { upsert: true },
  )
  logger.info('org settings updated')
  return next
}

export async function getUserNotificationPrefs(userId: string): Promise<UserNotificationPrefs> {
  const db = await getDb()
  const col = db.collection(COLLECTIONS.SETTINGS)
  const doc = await col.findOne({ userId })
  return {
    userId,
    submissionNotifications: doc?.submissionNotifications ?? true,
    deadlineReminders: doc?.deadlineReminders ?? true,
    approvalNotifications: doc?.approvalNotifications ?? true,
    updatedAt: doc?.updatedAt ?? new Date(),
  }
}

export async function updateUserNotificationPrefs(
  userId: string,
  patch: Partial<Omit<UserNotificationPrefs, 'userId' | 'updatedAt'>>,
): Promise<UserNotificationPrefs> {
  const db = await getDb()
  const col = db.collection(COLLECTIONS.SETTINGS)
  const updatedAt = new Date()
  const $set: Record<string, unknown> = { userId, updatedAt }
  if (typeof patch.submissionNotifications === 'boolean') $set.submissionNotifications = patch.submissionNotifications
  if (typeof patch.deadlineReminders === 'boolean') $set.deadlineReminders = patch.deadlineReminders
  if (typeof patch.approvalNotifications === 'boolean') $set.approvalNotifications = patch.approvalNotifications
  await col.updateOne(
    { userId },
    { $set },
    { upsert: true },
  )
  logger.info({ userId }, 'user notification prefs updated')
  return getUserNotificationPrefs(userId)
}
