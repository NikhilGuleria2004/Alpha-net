import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { put, del } from '@vercel/blob'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'

export interface Document {
  id: string
  projectId: string
  name: string
  size: number
  mimeType: string
  storageKey: string
  url?: string
  uploadedBy: string
  createdAt: Date
}

export interface CreateDocumentInput {
  projectId: string
  name: string
  size: number
  mimeType: string
  storageKey: string
  url?: string
  uploadedBy: string
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024

export function validateFile(mimeType: string, size: number): string | null {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return `Unsupported file type: ${mimeType}`
  }
  if (size > MAX_FILE_SIZE) {
    return `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
  }
  return null
}

export async function getDocumentsByProjectId(projectId: string): Promise<Document[]> {
  const db = await getDb()
  const documents = await db.collection(COLLECTIONS.DOCUMENTS).find({ projectId: new ObjectId(projectId) }).sort({ createdAt: -1 }).toArray()
  return documents.map((d) => ({
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    name: d.name,
    size: d.size,
    mimeType: d.mimeType,
    storageKey: d.storageKey,
    url: d.url,
    uploadedBy: d.uploadedBy.toString(),
    createdAt: d.createdAt,
  }))
}

export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const db = await getDb()
  const now = new Date()
  const doc = {
    projectId: new ObjectId(input.projectId),
    name: input.name,
    size: input.size,
    mimeType: input.mimeType,
    storageKey: input.storageKey,
    url: input.url,
    uploadedBy: new ObjectId(input.uploadedBy),
    createdAt: now,
  }
  const result = await db.collection(COLLECTIONS.DOCUMENTS).insertOne(doc)
  const created = {
    id: result.insertedId.toString(),
    projectId: input.projectId,
    name: doc.name,
    size: doc.size,
    mimeType: doc.mimeType,
    storageKey: doc.storageKey,
    url: doc.url,
    uploadedBy: input.uploadedBy,
    createdAt: doc.createdAt,
  }

  await createActivity({
    userId: input.uploadedBy,
    projectId: input.projectId,
    description: `Document "${input.name}" was uploaded.`,
  })

  return created
}

export async function deleteDocument(id: string): Promise<boolean> {
  const db = await getDb()
  const document = await db.collection(COLLECTIONS.DOCUMENTS).findOne({ _id: new ObjectId(id) })
  if (!document) return false

  try {
    await del(document.storageKey)
  } catch (err) {
    logger.warn({ err, storageKey: document.storageKey }, 'failed to delete blob')
  }

  const result = await db.collection(COLLECTIONS.DOCUMENTS).deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount > 0) {
    await createActivity({
      userId: document.uploadedBy.toString(),
      projectId: document.projectId.toString(),
      description: `Document "${document.name}" was deleted.`,
    })
  }
  return result.deletedCount > 0
}

export async function getDocumentById(id: string): Promise<Document | null> {
  const db = await getDb()
  const document = await db.collection(COLLECTIONS.DOCUMENTS).findOne({ _id: new ObjectId(id) })
  if (!document) return null
  return {
    id: document._id.toString(),
    projectId: document.projectId.toString(),
    name: document.name,
    size: document.size,
    mimeType: document.mimeType,
    storageKey: document.storageKey,
    url: document.url,
    uploadedBy: document.uploadedBy.toString(),
    createdAt: document.createdAt,
  }
}

// Store-level listing (QA C2): the app's document store needs one fetch that
// returns documents across all projects the requester can see. Previously the
// store initialized with a no-project call that returned [] by construction,
// so every uploaded document vanished from the UI after a reload.
export async function getAllDocuments(): Promise<Document[]> {
  const db = await getDb()
  const documents = await db.collection(COLLECTIONS.DOCUMENTS).find({}).sort({ createdAt: -1 }).toArray()
  return documents.map((d) => ({
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    name: d.name,
    size: d.size,
    mimeType: d.mimeType,
    storageKey: d.storageKey,
    url: d.url,
    uploadedBy: d.uploadedBy.toString(),
    createdAt: d.createdAt,
  }))
}

export async function getDocumentsByProjectIds(projectIds: string[]): Promise<Document[]> {
  if (projectIds.length === 0) return []
  const db = await getDb()
  const documents = await db
    .collection(COLLECTIONS.DOCUMENTS)
    .find({ projectId: { $in: projectIds.map((id) => new ObjectId(id)) } })
    .sort({ createdAt: -1 })
    .toArray()
  return documents.map((d) => ({
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    name: d.name,
    size: d.size,
    mimeType: d.mimeType,
    storageKey: d.storageKey,
    url: d.url,
    uploadedBy: d.uploadedBy.toString(),
    createdAt: d.createdAt,
  }))
}
