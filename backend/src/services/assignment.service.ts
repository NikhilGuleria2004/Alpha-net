import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'

// Flow Integration Phase 3 — Assignments domain (see /flowIntegration.md §5
// Phase 3). The assignment layer sits between resource and project so the
// downstream money documents (timesheets → invoices → payroll → margin) all
// share one bill/pay-rate contract.
//
// Backward compatibility is the hard constraint here:
//   * `assignments` is a NEW collection — nothing legacy reads it, so adding
//     it cannot change an existing response shape.
//   * The only legacy write is a `$addToSet` onto `projects.teamMemberIds`
//     when an assignment is created `active`, which mirrors the roster the
//     legacy project already maintains (additive, never a removal).

export type AssignmentStatus = 'active' | 'onHold' | 'completed' | 'terminated'
export type BillingType = 'hourly' | 'fixed' | 'monthly'

export interface Assignment {
  id: string
  resourceId: string
  projectId: string
  /** Inherited from `project.clientId` (or upserted from `project.client`) when omitted. */
  clientId?: string
  poSow?: string
  approverId?: string
  billingEntity?: string
  startDate: string
  endDate: string
  billRate: number
  payRate: number
  billingType: BillingType
  timesheetRequired: boolean
  approvalRequired: boolean
  status: AssignmentStatus
  createdAt: Date
  updatedAt: Date
}

export interface CreateAssignmentInput {
  resourceId: string
  projectId: string
  clientId?: string
  poSow?: string
  approverId?: string
  billingEntity?: string
  startDate: string
  endDate: string
  billRate: number
  payRate: number
  billingType?: BillingType
  timesheetRequired?: boolean
  approvalRequired?: boolean
  status?: AssignmentStatus
}

export interface UpdateAssignmentInput {
  clientId?: string
  poSow?: string
  approverId?: string
  billingEntity?: string
  startDate?: string
  endDate?: string
  billRate?: number
  payRate?: number
  billingType?: BillingType
  timesheetRequired?: boolean
  approvalRequired?: boolean
  status?: AssignmentStatus
}

export interface AssignmentFilters {
  resourceId?: string
  projectId?: string
  clientId?: string
  status?: AssignmentStatus
}

function toAssignment(doc: any): Assignment {
  return {
    id: doc._id.toString(),
    resourceId: doc.resourceId?.toString(),
    projectId: doc.projectId?.toString(),
    // Optional for legacy-shaped docs (e.g. hand-inserted rows): undefined.
    clientId: doc.clientId?.toString(),
    poSow: doc.poSow ?? undefined,
    approverId: doc.approverId?.toString(),
    billingEntity: doc.billingEntity ?? undefined,
    startDate: doc.startDate,
    endDate: doc.endDate,
    billRate: doc.billRate ?? 0,
    payRate: doc.payRate ?? 0,
    // Readers must tolerate missing values on legacy/hand-inserted docs.
    billingType: doc.billingType ?? 'hourly',
    timesheetRequired: doc.timesheetRequired ?? true,
    approvalRequired: doc.approvalRequired ?? true,
    status: doc.status ?? 'active',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}


function asObjectId(value: unknown): ObjectId | undefined {
  if (value instanceof ObjectId) return value
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value)
  return undefined
}

// Flow Integration Phase 3: resolve the client FK for an assignment.
// An explicit clientId must exist (bad admin input should surface, not
// silently rebind); when omitted we inherit `project.clientId` and otherwise
// upsert the legacy `project.client` string — the omitted path NEVER fails, so
// callers that predate the clients domain keep working.
async function resolveAssignmentClientId(
  db: Awaited<ReturnType<typeof getDb>>,
  opts: { explicitClientId?: string; explicitProvided: boolean; project: any },
): Promise<ObjectId | undefined> {
  if (opts.explicitProvided) {
    const explicit = asObjectId(opts.explicitClientId)
    if (!explicit) throw new Error('Client not found')
    const client = await db.collection(COLLECTIONS.CLIENTS).findOne({ _id: explicit })
    if (!client) throw new Error('Client not found')
    return explicit
  }
  const inherited = asObjectId(opts.project?.clientId)
  if (inherited) return inherited
  const clientName = typeof opts.project?.client === 'string' ? opts.project.client.trim() : ''
  if (!clientName) return undefined
  try {
    const { findOrCreateClient } = await import('./client.service.js')
    const client = await findOrCreateClient({ name: clientName })
    return new ObjectId(client.id)
  } catch (err) {
    logger.warn({ err }, 'assignment client auto-resolution failed; leaving clientId unset')
    return undefined
  }
}

// Dual-write helper: an ACTIVE assignment means the resource is on the project
// roster, which is exactly what `projects.teamMemberIds` already models. The
// write is best-effort — the assignment itself is already durable, and a
// failed roster sync must never fail the API call.
async function addResourceToProject(projectId: ObjectId, resourceId: ObjectId): Promise<void> {
  try {
    const db = await getDb()
    await db
      .collection(COLLECTIONS.PROJECTS)
      .updateOne({ _id: projectId }, { $addToSet: { teamMemberIds: resourceId } })
  } catch (err) {
    logger.warn({ err }, 'failed to dual-write teamMemberIds; project roster left unchanged')
  }
}

export async function listAssignments(filters?: AssignmentFilters): Promise<Assignment[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (filters?.resourceId) query.resourceId = new ObjectId(filters.resourceId)
  if (filters?.projectId) query.projectId = new ObjectId(filters.projectId)
  if (filters?.clientId) query.clientId = new ObjectId(filters.clientId)
  if (filters?.status) query.status = filters.status
  const docs = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .find(query)
    .sort({ startDate: -1 })
    .toArray()
  return docs.map(toAssignment)
}

export async function getAssignmentById(id: string): Promise<Assignment | null> {
  const db = await getDb()
  const objectId = asObjectId(id)
  if (!objectId) return null
  const doc = await db.collection(COLLECTIONS.ASSIGNMENTS).findOne({ _id: objectId })
  if (!doc) return null
  return toAssignment(doc)
}

// The single source of truth for "who is working on what right now". Later
// phases (timesheet auto-attach, payroll, margin) all resolve through this.
// Returns null instead of throwing so best-effort callers can continue.
export async function getActiveAssignment(resourceId: string, projectId: string): Promise<Assignment | null> {
  const db = await getDb()
  const resource = asObjectId(resourceId)
  const project = asObjectId(projectId)
  if (!resource || !project) return null
  const docs = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .find({ resourceId: resource, projectId: project, status: 'active' })
    .sort({ startDate: 1 })
    .toArray()
  if (!docs.length) return null
  return toAssignment(docs[0])
}

// Phase 4 entry point: an explicit `assignmentId` must be valid (that is admin
// input, so silent fallbacks would hide mistakes), while an omitted one is
// resolved best-effort and simply yields null when the pair has no assignment.
export async function resolveAssignmentForTimesheet(input: {
  resourceId: string
  projectId: string
  assignmentId?: string
}): Promise<Assignment | null> {
  if (input.assignmentId !== undefined && input.assignmentId !== '') {
    const assignment = await getAssignmentById(input.assignmentId)
    if (!assignment) throw new Error('Assignment not found')
    if (assignment.resourceId !== input.resourceId?.toString()) {
      throw new Error('Assignment does not belong to this resource')
    }
    if (input.projectId && assignment.projectId !== input.projectId.toString()) {
      throw new Error('Assignment does not belong to this project')
    }
    if (assignment.status !== 'active') throw new Error('Assignment is not active')
    return assignment
  }
  return getActiveAssignment(input.resourceId, input.projectId)
}

export async function createAssignment(input: CreateAssignmentInput, actorUserId?: string): Promise<Assignment> {
  const db = await getDb()
  const resourceId = asObjectId(input.resourceId)
  if (!resourceId) throw new Error('Resource not found')
  const projectId = asObjectId(input.projectId)
  if (!projectId) throw new Error('Project not found')

  const resource = await db.collection(COLLECTIONS.USERS).findOne({ _id: resourceId })
  if (!resource) throw new Error('Resource not found')
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: projectId })
  if (!project) throw new Error('Project not found')

  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    throw new Error('startDate must be on or before endDate')
  }

  const status: AssignmentStatus = input.status ?? 'active'
  if (status === 'active') {
    // Invariant: at most one ACTIVE assignment per (resource, project) so
    // getActiveAssignment() stays deterministic. The backfill honours it too.
    const existing = await getActiveAssignment(resourceId.toString(), projectId.toString())
    if (existing) throw new Error('Resource already has an active assignment on this project')
  }

  const clientId = await resolveAssignmentClientId(db, {
    explicitClientId: input.clientId,
    explicitProvided: input.clientId !== undefined,
    project,
  })

  const now = new Date()
  const doc: Record<string, any> = {
    resourceId,
    projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    billRate: input.billRate ?? 0,
    payRate: input.payRate ?? 0,
    billingType: input.billingType ?? 'hourly',
    timesheetRequired: input.timesheetRequired ?? true,
    approvalRequired: input.approvalRequired ?? true,
    status,
    createdAt: now,
    updatedAt: now,
  }
  if (clientId) doc.clientId = clientId
  if (input.poSow) doc.poSow = input.poSow
  if (input.approverId) doc.approverId = asObjectId(input.approverId)
  if (input.billingEntity) doc.billingEntity = input.billingEntity

  const result = await db.collection(COLLECTIONS.ASSIGNMENTS).insertOne(doc)
  const assignment = toAssignment({ ...doc, _id: result.insertedId })

  // Dual-write: an active assignment ⇒ the resource joins the project roster.
  if (status === 'active') await addResourceToProject(projectId, resourceId)

  if (actorUserId) {
    await createActivity({
      userId: actorUserId,
      projectId: projectId.toString(),
      description: `Assignment created for resource on project "${project.name ?? projectId.toString()}".`,
    })
  }

  return assignment
}



export async function updateAssignment(id: string, input: UpdateAssignmentInput): Promise<Assignment | null> {
  const db = await getDb()
  const objectId = asObjectId(id)
  if (!objectId) return null
  const existing = await db.collection(COLLECTIONS.ASSIGNMENTS).findOne({ _id: objectId })
  if (!existing) return null

  const update: Record<string, unknown> = { updatedAt: new Date() }

  if (input.clientId !== undefined) {
    const clientId = asObjectId(input.clientId)
    if (!clientId) throw new Error('Client not found')
    const client = await db.collection(COLLECTIONS.CLIENTS).findOne({ _id: clientId })
    if (!client) throw new Error('Client not found')
    update.clientId = clientId
  }
  if (input.poSow !== undefined) update.poSow = input.poSow
  if (input.approverId !== undefined) {
    const approverId = asObjectId(input.approverId)
    if (!approverId) throw new Error('Approver not found')
    update.approverId = approverId
  }
  if (input.billingEntity !== undefined) update.billingEntity = input.billingEntity
  if (input.startDate !== undefined) update.startDate = input.startDate
  if (input.endDate !== undefined) update.endDate = input.endDate
  if (input.billRate !== undefined) update.billRate = input.billRate
  if (input.payRate !== undefined) update.payRate = input.payRate
  if (input.billingType !== undefined) update.billingType = input.billingType
  if (input.timesheetRequired !== undefined) update.timesheetRequired = input.timesheetRequired
  if (input.approvalRequired !== undefined) update.approvalRequired = input.approvalRequired

  const nextStart = (update.startDate as string) ?? existing.startDate
  const nextEnd = (update.endDate as string) ?? existing.endDate
  if (nextStart && nextEnd && nextStart > nextEnd) throw new Error('startDate must be on or before endDate')

  if (input.status !== undefined) {
    update.status = input.status
    if (input.status === 'active' && existing.status !== 'active') {
      // Re-activating restores the roster entry (same best-effort rule as create).
      await addResourceToProject(existing.projectId as ObjectId, existing.resourceId as ObjectId)
    }
  }

  const result = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .findOneAndUpdate({ _id: objectId }, { $set: update }, { returnDocument: 'after' })
  if (!result) return null
  return toAssignment(result)
}


// Terminate ends the engagement but deliberately does NOT pull the resource
// from `projects.teamMemberIds`: the roster is a legacy surface shared with
// hand-managed membership, and removing someone from it could silently revoke
// project/timesheet access. Admins manage the roster explicitly.
export async function terminateAssignment(id: string, opts?: { endDate?: string }): Promise<Assignment | null> {
  const db = await getDb()
  const objectId = asObjectId(id)
  if (!objectId) return null
  const update: Record<string, unknown> = { status: 'terminated', updatedAt: new Date() }
  if (opts?.endDate) update.endDate = opts.endDate
  const result = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .findOneAndUpdate({ _id: objectId }, { $set: update }, { returnDocument: 'after' })
  if (!result) return null
  return toAssignment(result)
}

// Flow Integration Phase 8 (§5, item 3) — assignment lifecycle rollover:
// engagements whose validity window has closed move `active` → `completed`.
// `endDate` is an ISO `YYYY-MM-DD` string (assignment.schema enforces the
// format and start<=end), so a lexicographic `$lt` against today's date is a
// correct calendar comparison — the same ordering rule create/update already
// rely on.
//
// Only `active` rows are touched: `completed`/`terminated` stay as-is (the
// filter makes repeated runs idempotent), and `onHold` rows are deliberately
// left alone — a paused engagement should not silently "complete". No
// notifications are emitted (manual-first rollout; cron comes later).
export interface RolloverAssignmentsResult {
  matched: number
  completed: number
  asOf: string
}

export async function rolloverCompletedAssignments(asOf: Date = new Date()): Promise<RolloverAssignmentsResult> {
  const db = await getDb()
  const asOfDay = asOf.toISOString().slice(0, 10)
  const result = await db.collection(COLLECTIONS.ASSIGNMENTS).updateMany(
    { status: 'active', endDate: { $lt: asOfDay } },
    { $set: { status: 'completed', updatedAt: new Date() } },
  )
  return { matched: result.matchedCount, completed: result.modifiedCount, asOf: asOfDay }
}

