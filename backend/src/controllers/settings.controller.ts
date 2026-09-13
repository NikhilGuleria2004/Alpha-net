import { type Response } from 'express'
import {
  getOrgSettings,
  updateOrgSettings,
  getUserNotificationPrefs,
  updateUserNotificationPrefs,
} from '../services/settings.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'

export async function getOrgSettingsHandler(_req: AuthenticatedRequest, res: Response) {
  try {
    const settings = await getOrgSettings()
    res.json({ settings })
  } catch (err) {
    logger.error({ err }, 'failed to load org settings')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load settings' } })
  }
}

export async function putOrgSettings(req: AuthenticatedRequest, res: Response) {
  try {
    const patch: Record<string, unknown> = {}
    const body = req.body as Record<string, unknown>
    if (typeof body.companyName === 'string') patch.companyName = body.companyName
    if (typeof body.timezone === 'string') patch.timezone = body.timezone
    if (typeof body.weeklyStartDay === 'string') patch.weeklyStartDay = body.weeklyStartDay
    if (Array.isArray(body.workdays)) patch.workdays = body.workdays
    if (typeof body.standardWeeklyHours === 'number') patch.standardWeeklyHours = body.standardWeeklyHours
    if (typeof body.weekendOvertimeEnabled === 'boolean') patch.weekendOvertimeEnabled = body.weekendOvertimeEnabled
    const settings = await updateOrgSettings(patch)
    res.json({ settings })
  } catch (err) {
    logger.error({ err }, 'failed to update org settings')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to save settings' } })
  }
}

export async function getMyNotificationPrefs(req: AuthenticatedRequest, res: Response) {
  try {
    const prefs = await getUserNotificationPrefs(req.user!.userId)
    res.json({ prefs })
  } catch (err) {
    logger.error({ err }, 'failed to load notification prefs')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load preferences' } })
  }
}

export async function putMyNotificationPrefs(req: AuthenticatedRequest, res: Response) {
  try {
    const patch: Record<string, boolean> = {}
    const body = req.body as Record<string, unknown>
    if (typeof body.submissionNotifications === 'boolean') patch.submissionNotifications = body.submissionNotifications
    if (typeof body.deadlineReminders === 'boolean') patch.deadlineReminders = body.deadlineReminders
    if (typeof body.approvalNotifications === 'boolean') patch.approvalNotifications = body.approvalNotifications
    const prefs = await updateUserNotificationPrefs(req.user!.userId, patch)
    res.json({ prefs })
  } catch (err) {
    logger.error({ err }, 'failed to update notification prefs')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to save preferences' } })
  }
}
