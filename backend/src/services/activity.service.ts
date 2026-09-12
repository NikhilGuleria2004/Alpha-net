import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId, type WithId } from 'mongodb'
import { parseObjectId } from '../lib/objectid.js'

export interface Activity {
  id: string
  userId: string
  projectId?: string
  timesheetId?: string
  description: string
  createdAt: Date
}

export interface CreateActivityInput {
  userId: string
  projectId?: string
  timesheetId?: string
  description: string
}

export async function createActivity(input: CreateActivityInput): Promise<Activity> {
  const db = await getDb()
  const userId = parseObjectId(input.userId)
  const projectId = input.projectId ? parseObjectId(input.projectId) : null
  const timesheetId = input.timesheetId ? parseObjectId(input.timesheetId) : null
  const now = new Date()

  const doc = {
    userId,
    projectId: projectId ?? null,
    timesheetId: timesheetId ?? null,
    description: input.description,
    createdAt: now,
  }

  const result = await db.collection(COLLECTIONS.ACTIVITIES).insertOne(doc)
  if (!result?.insertedId) {
    throw new Error('Failed to create activity')
  }
  return {
    id: result.insertedId.toString(),
    userId: userId.toString(),
    projectId: projectId?.toString(),
    timesheetId: timesheetId?.toString(),
    description: doc.description,
    createdAt: doc.createdAt,
  }
}

export async function getActivitiesByUserId(userId: string): Promise<Activity[]> {
  const db = await getDb()
  const oid = parseObjectId(userId)
  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find({ userId: oid }).sort({ createdAt: -1 }).toArray()
  return activities.map(mapActivity)
}

export async function getActivitiesByProjectId(projectId: string): Promise<Activity[]> {
  const db = await getDb()
  const oid = parseObjectId(projectId)
  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find({ projectId: oid }).sort({ createdAt: -1 }).toArray()
  return activities.map(mapActivity)
}

export async function getActivitiesByTimesheetId(timesheetId: string): Promise<Activity[]> {
  const db = await getDb()
  const oid = parseObjectId(timesheetId)
  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find({ timesheetId: oid }).sort({ createdAt: -1 }).toArray()
  return activities.map(mapActivity)
}

export async function getActivitiesByProjectIds(projectIds: string[]): Promise<Activity[]> {
  if (projectIds.length === 0) return []
  const db = await getDb()
  const query: Record<string, unknown> = { projectId: { $in: projectIds.map((id) => parseObjectId(id)) } }
  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find(query).sort({ createdAt: -1 }).toArray()
  return activities.map(mapActivity)
}

export async function getAllActivities(filters?: { userId?: string; projectId?: string; timesheetId?: string }): Promise<Activity[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (filters?.userId) query.userId = parseObjectId(filters.userId)
  if (filters?.projectId) query.projectId = parseObjectId(filters.projectId)
  if (filters?.timesheetId) query.timesheetId = parseObjectId(filters.timesheetId)

  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find(query).sort({ createdAt: -1 }).toArray()
  return activities.map(mapActivity)
}

function mapActivity(a: WithId<Record<string, unknown>>): Activity {
  return {
    id: a._id.toString(),
    userId: safeString(a.userId),
    projectId: a.projectId ? safeString(a.projectId) : undefined,
    timesheetId: a.timesheetId ? safeString(a.timesheetId) : undefined,
    description: safeString(a.description),
    createdAt: a.createdAt instanceof Date ? a.createdAt : new Date(),
  }
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}
