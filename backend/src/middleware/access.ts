import { type Response, type NextFunction } from 'express'
import { type AuthenticatedRequest } from './auth.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

// Flow Integration Phase 3: an active assignment makes the resource a member
// of the project in every practical sense (they log time against it), so the
// project READ check gains an OR with the assignment layer. This can only
// WIDEN access — the legacy team-member/supervisor rules still decide first —
// and it is a no-op for every deployment that has no assignments backfilled
// yet. Failures are swallowed (deny-by-default) so a missing collection or a
// malformed id can never open a hole.
async function hasActiveAssignment(userId: string, projectId: string): Promise<boolean> {
  try {
    if (!ObjectId.isValid(userId) || !ObjectId.isValid(projectId)) return false
    const db = await getDb()
    const assignment = await db.collection(COLLECTIONS.ASSIGNMENTS).findOne({
      resourceId: new ObjectId(userId),
      projectId: new ObjectId(projectId),
      status: 'active',
    })
    return Boolean(assignment)
  } catch {
    return false
  }
}

export async function canAccessProject(userId: string, role: string, isSupervisor: boolean, projectId: string): Promise<boolean> {
  if (role === 'admin') return true
  const db = await getDb()
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(projectId) })
  if (!project) return false
  if (project.teamMemberIds?.some((id: any) => id.toString() === userId)) return true
  if (isSupervisor && project.supervisorId?.toString() === userId) return true
  // Phase 3: assignment-based access (additive, never narrower).
  if (await hasActiveAssignment(userId, projectId)) return true
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
  // H5 (QA.md): separation of duties — a user must not review their own
  // submission. Only admins (above) are allowed to self-review.
  if (timesheet.userId.toString() === userId) return false
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

export async function requireAdminOrProjectEdit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Allows admins and project supervisors to edit a project.
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

// Flow Integration Phase 3 — assignment access (see /flowIntegration.md §5
// Phase 3): admins always; the assigned resource (owner) always; the
// assignment's approver; and the supervising user of the assignment's project.
// Deny-by-default on any lookup failure.
export async function canAccessAssignment(
  userId: string,
  role: string,
  isSupervisor: boolean,
  assignmentId: string,
): Promise<boolean> {
  if (role === 'admin') return true
  if (!ObjectId.isValid(assignmentId)) return false
  const db = await getDb()
  const assignment = await db.collection(COLLECTIONS.ASSIGNMENTS).findOne({ _id: new ObjectId(assignmentId) })
  if (!assignment) return false
  if (assignment.resourceId?.toString() === userId) return true
  if (assignment.approverId?.toString() === userId) return true
  if (isSupervisor && assignment.projectId) {
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(assignment.projectId) })
    if (project && project.supervisorId?.toString() === userId) return true
  }
  return false
}

export async function requireAssignmentAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const assignmentId = (req.params.id ?? req.params.assignmentId) as string
  if (!assignmentId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Assignment ID is required' } })
  }
  const hasAccess = await canAccessAssignment(
    req.user!.userId,
    req.user!.role,
    req.user!.isSupervisor,
    assignmentId,
  )
  if (!hasAccess) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this assignment' } })
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

// --- Daily timesheets (ts.md Phase 4) --------------------------------------
// Daily entries are the child rows of a weekly timesheet (Phase 2/3). Access
// mirrors the weekly rules — admin, owner, or a supervisor with a relationship
// to the entry — with one deliberate asymmetry: a supervisor's *read* scope
// never becomes *write* scope, so only the owner (or an admin) can mutate a
// daily entry. That keeps daily edits from by-stepping the weekly
// submit/review flow that approvals depend on.

/**
 * True when `userId` is recorded as the direct supervisor of `targetUserId`
 * (`users.supervisorId`). Mirrors the scoping query used by
 * timesheet.controller.ts#listTimesheets, with deny-by-default on malformed
 * ids and on a missing USERS collection.
 */
export async function canSuperviseUser(userId: string, isSupervisor: boolean, targetUserId: string): Promise<boolean> {
  if (!isSupervisor) return false
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(targetUserId)) return false
  try {
    const db = await getDb()
    const subordinate = await db.collection(COLLECTIONS.USERS).findOne({
      _id: new ObjectId(targetUserId),
      supervisorId: new ObjectId(userId),
    })
    return Boolean(subordinate)
  } catch {
    return false
  }
}

export async function canAccessDailyTimesheet(userId: string, role: string, isSupervisor: boolean, entryId: string): Promise<boolean> {
  if (role === 'admin') return true
  if (!ObjectId.isValid(entryId)) return false
  const db = await getDb()
  const entry = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).findOne({ _id: new ObjectId(entryId) })
  if (!entry) return false
  if (entry.userId.toString() === userId) return true
  if (isSupervisor) {
    // Direct report (users.supervisorId) — the same scope the weekly list uses.
    if (await canSuperviseUser(userId, true, entry.userId.toString())) return true
    // Or the supervisor of the project the time was logged against.
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: entry.projectId })
    if (project && project.supervisorId?.toString() === userId) return true
  }
  return false
}

export async function canEditDailyTimesheet(userId: string, role: string, isSupervisor: boolean, entryId: string): Promise<boolean> {
  // `isSupervisor` is accepted for signature parity with the other canEdit*
  // helpers but intentionally unused: editing someone else's day is an admin
  // action (the owner changes their own rows before submitting the week).
  void isSupervisor
  if (role === 'admin') return true
  if (!ObjectId.isValid(entryId)) return false
  const db = await getDb()
  const entry = await db.collection(COLLECTIONS.DAILY_TIMESHEETS).findOne({ _id: new ObjectId(entryId) })
  if (!entry) return false
  return entry.userId.toString() === userId
}

export async function requireDailyTimesheetAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const entryId = (req.params.id ?? req.params.entryId) as string
  if (!entryId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Daily timesheet entry ID is required' } })
  }
  const hasAccess = await canAccessDailyTimesheet(req.user!.userId, req.user!.role, req.user!.isSupervisor, entryId)
  if (!hasAccess) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this daily timesheet entry' } })
  }
  next()
}

export async function requireDailyTimesheetEdit(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const entryId = (req.params.id ?? req.params.entryId) as string
  if (!entryId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Daily timesheet entry ID is required' } })
  }
  const canEdit = await canEditDailyTimesheet(req.user!.userId, req.user!.role, req.user!.isSupervisor, entryId)
  if (!canEdit) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Edit access denied to this daily timesheet entry' } })
  }
  next()
}
