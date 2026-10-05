import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import type {
  Assignment,
  AssignmentDemand,
  CreateAssignmentInput,
  StoredAssignmentStatus,
} from '../types/commercial.js'
import type { SupportedCurrencyCode } from '../types/auth.js'

/**
 * Assignments — EMS + platform shared collection (EMSBackend §7.6).
 *
 * Dual-write map (EMS field -> platform field):
 *   userId      -> `resourceId`  (the platform's name for the same person; its
 *                                  getActiveAssignment()/payroll queries use it,
 *                                  so it MUST be populated) and `userId` is also
 *                                  stored so the EMS index set stays useful
 *   billRate    -> `billRate`    (identical)
 *   payRate     -> `payRate`     (identical)
 *   status      -> platform vocabulary (`active|onHold|completed|terminated`)
 *   timesheetEnabled -> `timesheetRequired` (same meaning, inverted default off)
 *   currency / ftePercent / roleOnProject -> EMS-only additions
 *   billingType -> `hourly` (fixed for v1; the platform requires the field)
 *
 * Status is stored platform-native and translated on read, because the platform
 * filters `status: 'active'` to resolve an assignment for a timesheet.
 */

const DEFAULT_CURRENCY: SupportedCurrencyCode = 'USD'

/** Days before endDate at which an active assignment reads as `ending_soon`. */
const ENDING_SOON_DAYS = 14

export function toAssignment(doc: Record<string, any>): Assignment {
  const billRate = doc.billRate ?? 0
  const payRate = doc.payRate ?? 0
  const endDate = doc.endDate ?? ''

  const stored = (doc.status as StoredAssignmentStatus) ?? 'active'
  let status: Assignment['status']
  if (stored === 'active' && endDate && isWithinDays(endDate, ENDING_SOON_DAYS)) {
    status = 'ending_soon'
  } else if (stored === 'active') {
    status = 'active'
  } else if (stored === 'onHold') {
    status = 'proposed'
  } else {
    status = 'ended'
  }

  return {
    id: String(doc._id),
    userId: doc.userId ? String(doc.userId) : doc.resourceId ? String(doc.resourceId) : '',
    projectId: doc.projectId ? String(doc.projectId) : '',
    clientId: doc.clientId ? String(doc.clientId) : '',
    billRate,
    payRate,
    currency: (doc.currency as SupportedCurrencyCode) ?? DEFAULT_CURRENCY,
    ftePercent: doc.ftePercent ?? 100,
    roleOnProject: doc.roleOnProject || undefined,
    startDate: doc.startDate ?? '',
    endDate,
    status,
    // The platform's inverse flag; v1 enables timesheets unless told otherwise.
    timesheetEnabled: doc.timesheetEnabled ?? doc.timesheetRequired ?? true,
    marginPct: billRate > 0 ? (billRate - payRate) / billRate : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : '',
  }
}

function isWithinDays(dateString: string, days: number): boolean {
  const target = new Date(`${dateString}T00:00:00.000Z`).getTime()
  if (Number.isNaN(target)) {
    return false
  }
  const now = Date.now()
  return target >= now && target - now <= days * 24 * 60 * 60 * 1000
}

/** True when [start, end] intersects [otherStart, otherEnd] (inclusive). */
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

export interface AssignmentListFilters {
  userId?: string
  projectId?: string
  status?: string
}

/** Frontend status -> the stored values that can produce it. */
const STATUS_FILTER_MAP: Record<string, StoredAssignmentStatus[]> = {
  proposed: ['onHold'],
  active: ['active'],
  ended: ['completed', 'terminated'],
  // `ending_soon` is derived from endDate, so it filters on active + window.
  ending_soon: ['active'],
}

/**
 * GET /assignments — admin and manager see everything.
 */
export async function listAssignments(
  filters: AssignmentListFilters = {},
  scopeUserIds?: string[],
): Promise<{ assignments: Assignment[]; total: number }> {
  const db = await getDb()
  const query: Record<string, any> = {}

  if (filters.userId) {
    const userOid = new ObjectId(filters.userId)
    // Either vocabulary resolves, so rows written by either service match.
    query.$or = [{ resourceId: userOid }, { userId: userOid }]
  } else if (scopeUserIds) {
    // Supervisor team scope.
    const ids = scopeUserIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
    query.$or = [{ resourceId: { $in: ids } }, { userId: { $in: ids } }]
  }

  if (filters.projectId) {
    query.projectId = new ObjectId(filters.projectId)
  }

  if (filters.status) {
    const stored = STATUS_FILTER_MAP[filters.status]
    if (stored) {
      query.status = stored.length === 1 ? stored[0] : { $in: stored }
    }
  }

  const docs = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .find(query)
    .sort({ startDate: -1 })
    .toArray()

  let assignments = docs.map(toAssignment)
  // `ending_soon` is computed in the mapper, so it needs a post-filter.
  if (filters.status === 'ending_soon') {
    assignments = assignments.filter((a) => a.status === 'ending_soon')
  }

  return { assignments, total: assignments.length }
}

/**
 * POST /assignments — validates the resource/project, rejects a date overlap on
 * a live assignment (409 ASSIGNMENT_OVERLAP), writes both `resourceId` and
 * `userId`, and dual-writes the project roster (§7.6).
 */
export async function createAssignment(
  input: CreateAssignmentInput,
  actorId: string,
): Promise<Assignment> {
  const db = await getDb()

  const resource = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(input.userId) })
  if (!resource) {
    const err: any = new Error('Employee not found')
    err.code = 'USER_NOT_FOUND'
    throw err
  }

  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(input.projectId) })
  if (!project) {
    const err: any = new Error('Project not found')
    err.code = 'PROJECT_NOT_FOUND'
    throw err
  }

  // Overlap guard: one live assignment per resource at a time. The platform
  // enforces this only per (resource, project); EMS is stricter so a manager
  // cannot double-book someone across two overlapping projects.
  const live = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .find({
      $and: [
        { $or: [{ resourceId: new ObjectId(input.userId) }, { userId: new ObjectId(input.userId) }] },
        { status: { $in: ['active', 'onHold'] } },
      ],
    })
    .toArray()

  const clash = live.find((a: Record<string, any>) =>
    rangesOverlap(input.startDate, input.endDate, a.startDate ?? '', a.endDate ?? ''),
  )
  if (clash) {
    const err: any = new Error(
      `${resource.name ?? 'This employee'} already has a live assignment overlapping those dates`,
    )
    err.code = 'ASSIGNMENT_OVERLAP'
    throw err
  }

  // Platform invariant: at most one ACTIVE assignment per (resource, project).
  const sameProject = await db.collection(COLLECTIONS.ASSIGNMENTS).findOne({
    $and: [
      { projectId: new ObjectId(input.projectId) },
      { $or: [{ resourceId: new ObjectId(input.userId) }, { userId: new ObjectId(input.userId) }] },
      { status: 'active' },
    ],
  })
  if (sameProject) {
    const err: any = new Error('Employee already has an active assignment on this project')
    err.code = 'ASSIGNMENT_OVERLAP'
    throw err
  }

  const payRate = input.payRate ?? resource.payRate ?? 0
  const now = new Date()
  const doc: Record<string, any> = {
    // Platform field name for the same person.
    resourceId: new ObjectId(input.userId),
    // EMS/frontend field name for the same person.
    userId: new ObjectId(input.userId),
    projectId: new ObjectId(input.projectId),
    clientId: project.clientId ?? null,
    startDate: input.startDate,
    endDate: input.endDate,
    billRate: input.billRate,
    payRate,
    currency: input.currency ?? resource.currency ?? DEFAULT_CURRENCY,
    ftePercent: input.ftePercent ?? 100,
    // Platform-required fields.
    billingType: 'hourly',
    timesheetRequired: true,
    approvalRequired: true,
    status: 'active' as StoredAssignmentStatus,
    timesheetEnabled: true,
    createdAt: now,
    updatedAt: now,
  }
  if (input.roleOnProject !== undefined) doc.roleOnProject = input.roleOnProject
  if (project.sowNumber) doc.poSow = project.sowNumber

  const result = await db.collection(COLLECTIONS.ASSIGNMENTS).insertOne(doc)
  const assignment = toAssignment({ ...doc, _id: result.insertedId })

  // Dual-write: an active assignment puts the resource on the project roster.
  // $addToSet is additive and idempotent, mirroring the platform's own write.
  await db
    .collection(COLLECTIONS.PROJECTS)
    .updateOne({ _id: new ObjectId(input.projectId) }, { $addToSet: { teamMemberIds: new ObjectId(input.userId) } })

  await createActivity({
    userId: actorId,
    projectId: input.projectId,
    description: `Assignment created for ${resource.name ?? 'resource'} on project "${project.name ?? ''}".`,
    entityType: 'assignment',
    entityId: assignment.id,
  })

  logger.info(
    { actorId, assignmentId: assignment.id, projectId: input.projectId, userId: input.userId },
    'assignment created',
  )

  return assignment
}

/**
 * DELETE /assignments/:id — terminates the assignment (204 + audit).
 * The roster dual-write is intentionally NOT reversed: the platform's
 * `addResourceToProject` comment states teamMemberIds is append-only so the
 * legacy roster never silently loses a member.
 */
export async function terminateAssignment(id: string, actorId: string): Promise<boolean> {
  const db = await getDb()
  if (!ObjectId.isValid(id)) {
    return false
  }

  const existing = await db.collection(COLLECTIONS.ASSIGNMENTS).findOne({ _id: new ObjectId(id) })
  if (!existing) {
    return false
  }
  if (existing.status === 'terminated') {
    return false
  }

  const now = new Date()
  await db.collection(COLLECTIONS.ASSIGNMENTS).updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: 'terminated' as StoredAssignmentStatus, updatedAt: now } },
  )

  await createActivity({
    userId: actorId,
    projectId: existing.projectId ? String(existing.projectId) : undefined,
    description: 'Assignment terminated.',
    entityType: 'assignment',
    entityId: id,
  })

  return true
}

/**
 * GET /assignments/demand — staffing gaps per project (§7.6).
 * `seats` comes from the project's EMS `seats` field (default 1) and `filled`
 * counts its live assignments, so `seats - filled` is the open demand.
 */
export async function getAssignmentDemand(): Promise<{ demands: AssignmentDemand[] }> {
  const db = await getDb()

  const projects = await db
    .collection(COLLECTIONS.PROJECTS)
    .find({ status: { $in: ['draft', 'active'] } })
    .sort({ startDate: 1 })
    .toArray()

  const demands: AssignmentDemand[] = []
  for (const project of projects) {
    const filled = await db
      .collection(COLLECTIONS.ASSIGNMENTS)
      .countDocuments({ projectId: project._id, status: { $in: ['active', 'onHold'] } })

    const seats = project.seats ?? 1
    demands.push({
      id: String(project._id),
      projectName: project.name ?? '',
      role: project.roleOnProject ?? '',
      skills: project.skillsRequired ?? [],
      seats,
      filled,
      startDate: project.startDate ?? '',
      endDate: project.endDate ?? '',
    })
  }

  return { demands }
}