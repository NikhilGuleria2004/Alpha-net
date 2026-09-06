import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

export interface Activity {
  _id: string
  userId: string
  projectId?: string
  timesheetId?: string
  description: string
  createdAt: Date
}

export async function createActivity(input: {
  userId: string
  projectId?: string
  timesheetId?: string
  description: string
}): Promise<Activity> {
  const db = await getDb()
  const now = new Date()
  const doc = {
    userId: new ObjectId(input.userId),
    projectId: input.projectId ? new ObjectId(input.projectId) : null,
    timesheetId: input.timesheetId ? new ObjectId(input.timesheetId) : null,
    description: input.description,
    createdAt: now,
  }
  const result = await db.collection(COLLECTIONS.ACTIVITIES).insertOne(doc)
  return {
    _id: result.insertedId.toString(),
    userId: input.userId,
    projectId: doc.projectId?.toString(),
    timesheetId: doc.timesheetId?.toString(),
    description: doc.description,
    createdAt: doc.createdAt,
  }
}

export async function getActivitiesByUserId(userId: string): Promise<Activity[]> {
  const db = await getDb()
  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find({ userId: new ObjectId(userId) }).sort({ createdAt: -1 }).toArray()
  return activities.map((a) => ({
    _id: a._id.toString(),
    userId: a.userId.toString(),
    projectId: a.projectId?.toString(),
    timesheetId: a.timesheetId?.toString(),
    description: a.description,
    createdAt: a.createdAt,
  }))
}

export async function getActivitiesByProjectId(projectId: string): Promise<Activity[]> {
  const db = await getDb()
  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find({ projectId: new ObjectId(projectId) }).sort({ createdAt: -1 }).toArray()
  return activities.map((a) => ({
    _id: a._id.toString(),
    userId: a.userId.toString(),
    projectId: a.projectId?.toString(),
    timesheetId: a.timesheetId?.toString(),
    description: a.description,
    createdAt: a.createdAt,
  }))
}

export async function getActivitiesByTimesheetId(timesheetId: string): Promise<Activity[]> {
  const db = await getDb()
  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find({ timesheetId: new ObjectId(timesheetId) }).sort({ createdAt: -1 }).toArray()
  return activities.map((a) => ({
    _id: a._id.toString(),
    userId: a.userId.toString(),
    projectId: a.projectId?.toString(),
    timesheetId: a.timesheetId?.toString(),
    description: a.description,
    createdAt: a.createdAt,
  }))
}

export async function getAllActivities(filters?: { userId?: string; projectId?: string; timesheetId?: string }): Promise<Activity[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (filters?.userId) query.userId = new ObjectId(filters.userId)
  if (filters?.projectId) query.projectId = new ObjectId(filters.projectId)
  if (filters?.timesheetId) query.timesheetId = new ObjectId(filters.timesheetId)

  const activities = await db.collection(COLLECTIONS.ACTIVITIES).find(query).sort({ createdAt: -1 }).toArray()
  return activities.map((a) => ({
    _id: a._id.toString(),
    userId: a.userId.toString(),
    projectId: a.projectId?.toString(),
    timesheetId: a.timesheetId?.toString(),
    description: a.description,
    createdAt: a.createdAt,
  }))
}
