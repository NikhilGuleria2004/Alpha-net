import { type Request, type Response } from 'express'
import { getAllActivities, getActivitiesByUserId, getActivitiesByProjectId, getActivitiesByTimesheetId } from '../services/activity.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'

export async function listActivities(req: AuthenticatedRequest, res: Response) {
  const isAdmin = req.user?.role === 'admin'
  const activities = await getAllActivities({
    userId: isAdmin ? req.query.userId ? String(req.query.userId) : undefined : req.user!.userId,
    projectId: req.query.projectId ? String(req.query.projectId) : undefined,
    timesheetId: req.query.timesheetId ? String(req.query.timesheetId) : undefined,
  })
  res.json({ activities })
}

export async function getUserActivities(req: AuthenticatedRequest, res: Response) {
  const isAdmin = req.user?.role === 'admin'
  const isSelf = req.params.userId === req.user!.userId
  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
  }
  const activities = await getActivitiesByUserId(req.params.userId as string)
  res.json({ activities })
}

export async function getProjectActivities(req: AuthenticatedRequest, res: Response) {
  const activities = await getActivitiesByProjectId(req.params.projectId as string)
  res.json({ activities })
}

export async function getTimesheetActivities(req: AuthenticatedRequest, res: Response) {
  const activities = await getActivitiesByTimesheetId(req.params.timesheetId as string)
  res.json({ activities })
}
