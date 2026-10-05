import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import { toAssignment } from './assignment.service.js'
import type {
  CreateProjectInput,
  Project,
  ProjectDocumentSummary,
  ProjectTeamMember,
} from '../types/commercial.js'

/**
 * Projects — EMS + platform shared collection (EMSBackend §7.6).
 *
 * Dual-write map (EMS field -> platform field):
 *   name/sowNumber/startDate/endDate/deadline/status -> identical
 *   clientId (ref)  -> `clientId`   AND the legacy `client` name string, because
 *                                   the platform's `toProject` still returns
 *                                   `doc.client` and its invoice/PDF code prints it
 *   billRateDefault  -> `hourlyRate` (the platform's only rate field)
 *   poCap/skillsRequired/seats/roleOnProject -> EMS-only additions
 *   teamMemberIds    -> maintained by the assignment service ($addToSet)
 *
 * The platform's `toProject` uses optional chaining for clientId/managerId/
 * supervisorId/teamMemberIds/poCap, so a row missing those still reads cleanly.
 */

export function toProject(doc: Record<string, any>): Project {
  return {
    id: String(doc._id),
    name: doc.name ?? '',
    sowNumber: doc.sowNumber ?? '',
    client: doc.client ?? '',
    clientId: doc.clientId ? String(doc.clientId) : undefined,
    description: doc.description ?? '',
    startDate: doc.startDate ?? '',
    endDate: doc.endDate ?? '',
    deadline: doc.deadline ?? '',
    status: doc.status ?? 'draft',
    managerId: doc.managerId ? String(doc.managerId) : '',
    supervisorId: doc.supervisorId ? String(doc.supervisorId) : '',
    teamMemberIds: (doc.teamMemberIds ?? []).map((id: unknown) => String(id)),
    hourlyRate: doc.hourlyRate ?? null,
    poCap: doc.poCap ?? null,
    skillsRequired: doc.skillsRequired,
    billRateDefault: doc.billRateDefault ?? null,
    seats: doc.seats,
    roleOnProject: doc.roleOnProject,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : '',
  }
}

export interface ProjectListFilters {
  clientId?: string
  status?: string
}

/** GET /projects — { projects, total } for admin/manager. */
export async function listProjects(
  filters: ProjectListFilters = {},
): Promise<{ projects: Project[]; total: number }> {
  const db = await getDb()
  const query: Record<string, any> = {}
  if (filters.clientId) {
    query.clientId = new ObjectId(filters.clientId)
  }
  if (filters.status) {
    query.status = filters.status
  }

  const docs = await db
    .collection(COLLECTIONS.PROJECTS)
    .find(query)
    .sort({ createdAt: -1 })
    .toArray()

  return { projects: docs.map(toProject), total: docs.length }
}

/**
 * POST /projects — resolves the client reference and mirrors its name into the
 * legacy `client` string so the platform keeps rendering the right client.
 * A duplicate `sowNumber` surfaces as 409 CONFLICT (§7.6).
 */
export async function createProject(
  input: CreateProjectInput,
  actorId: string,
): Promise<Project> {
  const db = await getDb()

  const client = await db.collection(COLLECTIONS.CLIENTS).findOne({ _id: new ObjectId(input.clientId) })
  if (!client) {
    const err: any = new Error('Client not found')
    err.code = 'CLIENT_NOT_FOUND'
    throw err
  }

  // Surface the unique-index violation as a typed 409 rather than a 500.
  const duplicate = await db
    .collection(COLLECTIONS.PROJECTS)
    .findOne({ sowNumber: input.sowNumber })
  if (duplicate) {
    const err: any = new Error(`SOW number "${input.sowNumber}" is already in use`)
    err.code = 'SOW_CONFLICT'
    throw err
  }

  const now = new Date()
  const doc: Record<string, any> = {
    name: input.name,
    sowNumber: input.sowNumber,
    clientId: new ObjectId(input.clientId),
    // Legacy denormalized name the platform still reads and prints.
    client: client.name,
    description: input.description ?? '',
    startDate: input.startDate,
    endDate: input.endDate,
    deadline: input.deadline ?? input.endDate,
    status: input.status ?? 'draft',
    managerId: new ObjectId(actorId),
    // The creating manager owns the project until HR assigns another manager.
    supervisorId: null,
    teamMemberIds: [],
    // The platform stores a single `hourlyRate`; EMS's default bill rate maps here.
    hourlyRate: input.billRateDefault ?? null,
    createdAt: now,
    updatedAt: now,
  }
  if (input.poCap !== undefined) doc.poCap = input.poCap
  if (input.skillsRequired !== undefined) doc.skillsRequired = input.skillsRequired
  if (input.billRateDefault !== undefined) doc.billRateDefault = input.billRateDefault
  if (input.seats !== undefined) doc.seats = input.seats
  if (input.roleOnProject !== undefined) doc.roleOnProject = input.roleOnProject

  let result
  try {
    result = await db.collection(COLLECTIONS.PROJECTS).insertOne(doc)
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) {
      const conflict: any = new Error(`SOW number "${input.sowNumber}" is already in use`)
      conflict.code = 'SOW_CONFLICT'
      throw conflict
    }
    throw err
  }

  const project = toProject({ ...doc, _id: result.insertedId })

  await createActivity({
    userId: actorId,
    projectId: project.id,
    description: `Project "${project.name}" was created.`,
    entityType: 'project',
    entityId: project.id,
  })

  logger.info({ actorId, projectId: project.id, sowNumber: project.sowNumber }, 'project created')

  return project
}

/**
 * GET /projects/:id — { project, assignments, team, documents } (§7.6).
 * `team` is resolved from the project's active assignments plus any legacy
 * `teamMemberIds` the platform still maintains.
 */
export async function getProjectDetail(id: string): Promise<{
  project: Project
  assignments: ReturnType<typeof toAssignment>[]
  team: ProjectTeamMember[]
  documents: ProjectDocumentSummary[]
} | null> {
  const db = await getDb()
  if (!ObjectId.isValid(id)) {
    return null
  }
  const projectOid = new ObjectId(id)

  const doc = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: projectOid })
  if (!doc) {
    return null
  }

  const [assignmentDocs, documentDocs] = await Promise.all([
    db
      .collection(COLLECTIONS.ASSIGNMENTS)
      .find({ projectId: projectOid })
      .sort({ startDate: -1 })
      .toArray(),
    db
      .collection(COLLECTIONS.DOCUMENTS)
      .find({ projectId: projectOid })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray(),
  ])

  const assignments = assignmentDocs.map(toAssignment)

  // Union of assignment resources and the legacy roster, de-duplicated.
  const memberIds = new Set<string>([
    ...(doc.teamMemberIds ?? []).map((m: unknown) => String(m)),
    ...assignmentDocs.map((a: Record<string, any>) => String(a.resourceId ?? a.userId ?? '')),
  ])
  memberIds.delete('')

  const validMemberIds = [...memberIds].filter((m) => ObjectId.isValid(m)).map((m) => new ObjectId(m))
  const users = validMemberIds.length
    ? await db
        .collection(COLLECTIONS.USERS)
        .find({ _id: { $in: validMemberIds } })
        .project({ name: 1, title: 1 })
        .toArray()
    : []
  const namesById = new Map(users.map((u: Record<string, any>) => [String(u._id), u.name ?? '']))
  const roleById = new Map<string, string>()
  for (const assignment of assignmentDocs) {
    const key = String(assignment.resourceId ?? assignment.userId ?? '')
    if (key && assignment.roleOnProject) {
      roleById.set(key, assignment.roleOnProject)
    }
  }

  return {
    project: toProject(doc),
    assignments,
    team: [...memberIds].map((userId) => ({
      userId,
      name: namesById.get(userId) ?? '',
      role: roleById.get(userId) ?? (doc.roleOnProject as string | undefined) ?? '',
    })),
    documents: documentDocs.map((d: Record<string, any>) => ({
      id: String(d._id),
      name: d.name ?? '',
      kind: d.kind ?? 'other',
      uploadedAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
    })),
  }
}