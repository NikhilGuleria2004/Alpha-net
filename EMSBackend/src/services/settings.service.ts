import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { createActivity } from './activity.service.js'
import type { OrgSettings, UserSettings } from '../types/system.js'

/**
 * Settings (EMSBackend §7.8, task 7.4).
 *
 * The shared `settings` collection holds one org row keyed by `orgKey: 'global'`
 * (unique index) plus one row per user keyed by `userId`. Theme and density are
 * deliberately NOT stored here — they stay in the client's localStorage
 * (see `SettingsPage.tsx`, which reads them from Theme/Density contexts).
 */

export const ORG_KEY = 'global'

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  orgName: 'Eniac Inc.',
  showBillRateToEmployee: false,
  leavePolicy: {
    annualLeaveDays: 20,
    sickLeaveDays: 10,
    lockAfterApproval: true,
  },
  approvalChain: ['manager', 'hr', 'admin'],
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  phone: '',
  notifications: { inApp: true, email: false },
}

/**
 * GET /settings/org — returns the stored row, or the defaults without writing on
 * read (a cold DB stays cold; the first PUT creates the row).
 */
export async function getOrgSettings(): Promise<OrgSettings> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.SETTINGS).findOne({ orgKey: ORG_KEY })
  if (!doc) return { ...DEFAULT_ORG_SETTINGS }

  return {
    orgName: doc.orgName ?? DEFAULT_ORG_SETTINGS.orgName,
    showBillRateToEmployee: Boolean(doc.showBillRateToEmployee),
    leavePolicy: {
      annualLeaveDays: doc.leavePolicy?.annualLeaveDays ?? DEFAULT_ORG_SETTINGS.leavePolicy.annualLeaveDays,
      sickLeaveDays: doc.leavePolicy?.sickLeaveDays ?? DEFAULT_ORG_SETTINGS.leavePolicy.sickLeaveDays,
      lockAfterApproval: Boolean(doc.leavePolicy?.lockAfterApproval),
    },
    approvalChain:
      Array.isArray(doc.approvalChain) && doc.approvalChain.length > 0
        ? doc.approvalChain
        : DEFAULT_ORG_SETTINGS.approvalChain,
  }
}

/** PUT /settings/org — upsert on the unique `orgKey`. */
export async function updateOrgSettings(
  input: OrgSettings,
  actorId: string,
): Promise<OrgSettings> {
  const db = await getDb()
  const now = new Date()

  await db.collection(COLLECTIONS.SETTINGS).updateOne(
    { orgKey: ORG_KEY },
    {
      $set: { ...input, orgKey: ORG_KEY, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )

  await createActivity({
    userId: actorId,
    description: `Org settings updated (bill rates visible to employees: ${input.showBillRateToEmployee ? 'yes' : 'no'}).`,
    entityType: 'settings',
    entityId: ORG_KEY,
  })

  return getOrgSettings()
}

/** GET /settings/me — the caller's row, or defaults without writing. */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.SETTINGS).findOne({ userId: new ObjectId(userId) })
  if (!doc) return { ...DEFAULT_USER_SETTINGS, notifications: { ...DEFAULT_USER_SETTINGS.notifications } }

  return {
    phone: doc.phone ?? '',
    notifications: {
      inApp: doc.notifications?.inApp ?? DEFAULT_USER_SETTINGS.notifications.inApp,
      email: doc.notifications?.email ?? DEFAULT_USER_SETTINGS.notifications.email,
    },
  }
}

/**
 * PUT /settings/me — partial update. Unsent fields keep their current value, so
 * a client that only changes `phone` cannot silently reset its notification
 * preferences.
 */
export async function updateUserSettings(
  userId: string,
  input: { phone?: string; notifications?: { inApp: boolean; email: boolean } },
): Promise<UserSettings> {
  const db = await getDb()
  const current = await getUserSettings(userId)
  const next: UserSettings = {
    phone: input.phone ?? current.phone,
    notifications: input.notifications
      ? { ...input.notifications }
      : { ...current.notifications },
  }

  const now = new Date()
  await db.collection(COLLECTIONS.SETTINGS).updateOne(
    { userId: new ObjectId(userId) },
    {
      $set: { ...next, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )

  return next
}