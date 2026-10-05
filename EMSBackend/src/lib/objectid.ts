import { ObjectId } from 'mongodb'
import { logger } from './logger.js'

/**
 * Non-throwing companion to parseObjectId(): returns the ObjectId when `id` is
 * already one or a valid 24-character hex string, otherwise null.
 */
export function tryParseObjectId(id: unknown): ObjectId | null {
  if (id instanceof ObjectId) return id
  if (typeof id !== 'string' || id.trim() === '') return null
  try {
    return new ObjectId(id)
  } catch {
    return null
  }
}

export function parseObjectId(id: unknown): ObjectId {
  if (typeof id !== 'string') {
    throw new Error('Invalid ID: expected a string')
  }
  try {
    return new ObjectId(id)
  } catch {
    logger.warn({ id }, 'invalid objectid')
    throw new Error('Invalid ID format')
  }
}
