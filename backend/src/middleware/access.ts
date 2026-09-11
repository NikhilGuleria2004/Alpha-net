import { type Response, type NextFunction } from 'express'
import { type AuthenticatedRequest } from './auth.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

export async function canAccessProject(userId: string, role: string, isSupervisor: boolean, projectId: string): Promise<boolean> {
  if (role === 'admin') return true
  const db = await getDb()
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(projectId) })
  if (!project) return false
  if (project.teamMemberIds.some((id: any) => id.toString() === userId)) return true
  if (isSupervisor && project.supervisorId.toString() === userId) return true
  return false
}

export async function canEditProject(userId: string, role: string, isSupervisor: boolean, projectId: string): Promise<boolean> {
  if (role === 'admin') return true
  const db = await getDb()
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(projectId) })
  if (!project) return false
  if (isSupervisor && project.supervisorId.toString() === userId) return true
  return false
}

export async function canAccessTimesheet(userId: string, role: string, isSupervisor: boolean, timesheetId: string): Promise<boolean> {
  if (role === 'admin') return true
  const db = await getDb()
  const timesheet = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(timesheetId) })
  if (!timesheet) return false
  if (timesheet.userId.toString() === userId) return true
  if (isSupervisor) {
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(timesheet.projectId) })
    if (project && project.supervisorId.toString() === userId) return true
  }
  return false
}

export async function canEditTimesheet(userId: string, role: string, isSupervisor: boolean, timesheetId: string): Promise<boolean> {
  if (role === 'admin') return true
  const db = await getDb()
  const timesheet = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(timesheetId) })
  if (!timesheet) return false
  if (timesheet.userId.toString() === userId) return true
  return false
}

export async function canReviewTimesheet(userId: string, role: string, isSupervisor: boolean, timesheetId: string): Promise<boolean> {
  if (role === 'admin') return true
  if (!isSupervisor) return false
  const db = await getDb()
  const timesheet = await db.collection(COLLECTIONS.TIMESHEETS).findOne({ _id: new ObjectId(timesheetId) })
  if (!timesheet) return false
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(timesheet.projectId) })
  if (project && project.supervisorId.toString() === userId) return true
  return false
}

export async function canManageUser(_userId: string, role: string): Promise<boolean> {
  return role === 'admin'
}

export async function requireProjectAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Document routes are mounted at /:projectId/documents while project routes use /:id,
  // so accept both param names.
  const projectId = (req.params.projectId ?? req.params.id) as string
  if (!projectId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Project ID is required' } })
  }
  const hasAccess = await canAccessProject(req.user!.userId, req.user!.role, req.user!.isSupervisor, projectId)
  if (!hasAccess) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this project' } })
  }
  next()
}

export async function requireProjectEdit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Document routes are mounted at /:projectId/documents while project routes use /:id,
  // so accept both param names.
  const projectId = (req.params.projectId ?? req.params.id) as string
  if (!projectId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Project ID is required' } })
  }
  const canEdit = await canEditProject(req.user!.userId, req.user!.role, req.user!.isSupervisor, projectId)
  if (!canEdit) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Edit access denied to this project' } })
  }
  next()
}

export async function requireTimesheetAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const timesheetId = req.params.id as string
  if (!timesheetId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Timesheet ID is required' } })
  }
  const hasAccess = await canAccessTimesheet(req.user!.userId, req.user!.role, req.user!.isSupervisor, timesheetId)
  if (!hasAccess) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this timesheet' } })
  }
  next()
}

export async function requireTimesheetEdit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const timesheetId = req.params.id as string
  if (!timesheetId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Timesheet ID is required' } })
  }
  const canEdit = await canEditTimesheet(req.user!.userId, req.user!.role, req.user!.isSupervisor, timesheetId)
  if (!canEdit) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Edit access denied to this timesheet' } })
  }
  next()
}

export async function requireTimesheetReview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const timesheetId = req.params.id as string
  if (!timesheetId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Timesheet ID is required' } })
  }
  const canReview = await canReviewTimesheet(req.user!.userId, req.user!.role, req.user!.isSupervisor, timesheetId)
  if (!canReview) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Review access denied to this timesheet' } })
  }
  next()
}

export async function requireUserManage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const isAdmin = req.user?.role === 'admin'
  if (!isAdmin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'User management access denied' } })
  }
  next()
}
