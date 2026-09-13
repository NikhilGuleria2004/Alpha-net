import { ObjectId } from 'mongodb'
import { logger } from './logger.js'

export function parseObjectId(id: unknown): ObjectId {
  if (typeof id !== 'string') {
    throw new Error('Invalid ID: expected a string')
  }
  try {
    return new ObjectId(id)
  } catch (err) {
    logger.warn({ id }, 'invalid objectid')
    throw new Error('Invalid ID format')
  }
}
