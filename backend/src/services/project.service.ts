import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { createNotification } from './notification.service.js'
import { createActivity } from './activity.service.js'

export type ProjectStatus = 'draft' | 'active' | 'completed' | 'overdue' | 'archived'

export interface Project {
  id: string
  name: string
  sowNumber: string
  client: string
  description: string
  startDate: string
  endDate: string
  deadline: string
  status: ProjectStatus
  managerId: string
  supervisorId: string
  teamMemberIds: string[]
  documentIds: string[]
  createdAt: Date
  updatedAt: Date
}

export interface CreateProjectInput {
  name: string
  sowNumber: string
  client: string
  description: string
  startDate: string
  endDate: string
  deadline: string
  status: ProjectStatus
  managerId: string
  supervisorId: string
  teamMemberIds: string[]
}

export interface UpdateProjectInput {
  name?: string
  sowNumber?: string
  client?: string
  description?: string
  startDate?: string
  endDate?: string
  deadline?: string
  status?: ProjectStatus
  managerId?: string
  supervisorId?: string
  teamMemberIds?: string[]
}

function toProject(doc: any): Project {
  return {
    id: doc._id.toString(),
    name: doc.name,
    sowNumber: doc.sowNumber,
    client: doc.client,
    description: doc.description,
    startDate: doc.startDate,
    endDate: doc.endDate,
    deadline: doc.deadline,
    status: doc.status,
    managerId: doc.managerId.toString(),
    supervisorId: doc.supervisorId.toString(),
    teamMemberIds: doc.teamMemberIds.map((id: any) => id.toString()),
    documentIds: doc.documentIds.map((id: any) => id.toString()),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function getProjects(filters?: { status?: ProjectStatus; managerId?: string; supervisorId?: string }): Promise<Project[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (filters?.status) query.status = filters.status
  if (filters?.managerId) query.managerId = new ObjectId(filters.managerId)
  if (filters?.supervisorId) query.supervisorId = new ObjectId(filters.supervisorId)

  const projects = await db.collection(COLLECTIONS.PROJECTS).find(query).toArray()
  return projects.map(toProject)
}

export async function getProjectById(id: string): Promise<Project | null> {
  const db = await getDb()
  const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: new ObjectId(id) })
  if (!project) return null
  return toProject(project)
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const db = await getDb()
  const now = new Date()
  const doc = {
    name: input.name,
    sowNumber: input.sowNumber,
    client: input.client,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    deadline: input.deadline,
    status: input.status,
    managerId: new ObjectId(input.managerId),
    supervisorId: new ObjectId(input.supervisorId),
    teamMemberIds: input.teamMemberIds.map((id) => new ObjectId(id)),
    documentIds: [],
    createdAt: now,
    updatedAt: now,
  }
  const result = await db.collection(COLLECTIONS.PROJECTS).insertOne(doc)
  const project = toProject({ ...doc, _id: result.insertedId })

  await createActivity({
    userId: input.managerId,
    projectId: project.id,
    description: `Project "${project.name}" was created.`,
  })

  return project
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project | null> {
  const db = await getDb()
  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) update.name = input.name
  if (input.sowNumber !== undefined) update.sowNumber = input.sowNumber
  if (input.client !== undefined) update.client = input.client
  if (input.description !== undefined) update.description = input.description
  if (input.startDate !== undefined) update.startDate = input.startDate
  if (input.endDate !== undefined) update.endDate = input.endDate
  if (input.deadline !== undefined) update.deadline = input.deadline
  if (input.status !== undefined) update.status = input.status
  if (input.managerId !== undefined) update.managerId = new ObjectId(input.managerId)
  if (input.supervisorId !== undefined) update.supervisorId = new ObjectId(input.supervisorId)
  if (input.teamMemberIds !== undefined) update.teamMemberIds = input.teamMemberIds.map((id) => new ObjectId(id))

  const result = await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  )
  if (!result) return null
  const updated = toProject(result)

  await createActivity({
    userId: input.managerId || updated.managerId,
    projectId: updated.id,
    description: `Project "${updated.name}" was updated.`,
  })

  return updated
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.PROJECTS).deleteOne({ _id: new ObjectId(id) })
  return result.deletedCount > 0
}

export async function addTeamMember(projectId: string, userId: string): Promise<Project | null> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
    { _id: new ObjectId(projectId), teamMemberIds: { $ne: new ObjectId(userId) } },
    { $addToSet: { teamMemberIds: new ObjectId(userId) }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!result) return null
  const project = toProject(result)

  await createNotification({
    userId,
    type: 'assignment',
    title: 'Assigned to Project',
    message: `You have been added to the project "${project.name}".`,
    relatedId: projectId,
  })

  await createActivity({
    userId,
    projectId,
    description: `User assigned to project "${project.name}".`,
  })

  return project
}

export async function removeTeamMember(projectId: string, userId: string): Promise<Project | null> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
    { _id: new ObjectId(projectId) },
    { $pull: { teamMemberIds: new ObjectId(userId) } as any, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!result) return null
  const project = toProject(result)

  await createActivity({
    userId,
    projectId,
    description: `User removed from project "${project.name}".`,
  })

  return project
}

export async function assignSupervisor(projectId: string, supervisorId: string): Promise<Project | null> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.PROJECTS).findOneAndUpdate(
    { _id: new ObjectId(projectId) },
    { $set: { supervisorId: new ObjectId(supervisorId), updatedAt: new Date() } },
    { returnDocument: 'after' }
  )
  if (!result) return null
  const project = toProject(result)

  await createNotification({
    userId: supervisorId,
    type: 'assignment',
    title: 'Assigned as Supervisor',
    message: `You have been assigned as supervisor for the project "${project.name}".`,
    relatedId: projectId,
  })

  await createActivity({
    userId: supervisorId,
    projectId,
    description: `Supervisor assigned to project "${project.name}".`,
  })

  return project
}

export async function getProjectsForUser(userId: string, role: string, isSupervisor: boolean): Promise<Project[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (role === 'admin') {
    return getProjects()
  }
  if (isSupervisor) {
    const supervised = await db.collection(COLLECTIONS.PROJECTS).find({ supervisorId: new ObjectId(userId) }).toArray()
    const member = await db.collection(COLLECTIONS.PROJECTS).find({ teamMemberIds: new ObjectId(userId) }).toArray()
    const map = new Map<string, any>()
    for (const p of [...supervised, ...member]) map.set(p._id.toString(), p)
    return Array.from(map.values()).map(toProject)
  }
  const projects = await db.collection(COLLECTIONS.PROJECTS).find({ teamMemberIds: new ObjectId(userId) }).toArray()
  return projects.map(toProject)
}

export async function canAccessProject(userId: string, role: string, isSupervisor: boolean, projectId: string): Promise<boolean> {
  if (role === 'admin') return true
  const project = await getProjectById(projectId)
  if (!project) return false
  if (project.teamMemberIds.includes(userId)) return true
  if (isSupervisor && project.supervisorId === userId) return true
  return false
}
