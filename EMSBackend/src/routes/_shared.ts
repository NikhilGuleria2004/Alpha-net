import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'

/**
 * Resolve a user's display name for notification/audit text.
 * Small shared helper for routes that need a human-readable reviewer or
 * uploader name but do not otherwise need the users collection.
 */
export async function resolveRequesterName(userId: string): Promise<string> {
  if (!ObjectId.isValid(userId)) {
    return ''
  }
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(userId) })
  return user?.name ?? ''
}