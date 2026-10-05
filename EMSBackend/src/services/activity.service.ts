import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { parseObjectId } from '../lib/objectid.js'
import { logger } from '../lib/logger.js'

export interface CreateActivityInput {
  userId: string
  projectId?: string
  timesheetId?: string
  description: string
  entityType?: string
  entityId?: string
}

export async function createActivity(input: CreateActivityInput): Promise<{ id: string }> {
  try {
    const db = await getDb()
    const doc = {
      userId: parseObjectId(input.userId),
      projectId: input.projectId ? parseObjectId(input.projectId) : null,
      timesheetId: input.timesheetId ? parseObjectId(input.timesheetId) : null,
      description: input.description,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      createdAt: new Date(),
    }
    const result = await db.collection(COLLECTIONS.ACTIVITIES).insertOne(doc)
    return { id: result.insertedId.toString() }
  } catch (err) {
    // Audit log is fire-and-forget: never fail the request on activity insert.
    logger.warn({ err, description: input.description }, 'failed to create activity')
    return { id: '' }
  }
}
