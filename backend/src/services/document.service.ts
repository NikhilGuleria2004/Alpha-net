import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { put, del } from '@vercel/blob'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import { type DocumentKind } from '../schemas/document.schema.js'

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
  /** Phase 8 — subject of the onboarding doc; absent on legacy/project docs. */
  userId?: string
  /** Phase 8 — onboarding category (i9|w4|offer|other); absent on legacy docs. */
  kind?: DocumentKind
}

export interface CreateDocumentInput {
  projectId: string
  name: string
  size: number
  mimeType: string
  storageKey: string
  url?: string
  uploadedBy: string
  userId?: string
  kind?: DocumentKind
}

// Flow Integration Phase 8 (§5, item 1): shared mapper for every read path.
// `userId`/`kind` are optional onboarding metadata — the keys are only present
// on documents that carry them, so legacy docs keep their exact response shape.
function toDocument(d: any): Document {
  return {
    id: d._id.toString(),
    projectId: d.projectId.toString(),
    name: d.name,
    size: d.size,
    mimeType: d.mimeType,
    storageKey: d.storageKey,
    url: d.url,
    uploadedBy: d.uploadedBy.toString(),
    createdAt: d.createdAt,
    ...(d.userId !== undefined && d.userId !== null ? { userId: d.userId.toString() } : {}),
    ...(d.kind !== undefined ? { kind: d.kind } : {}),
  }
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
  return documents.map(toDocument)
}

export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const db = await getDb()
  const now = new Date()
  const doc: Record<string, any> = {
    projectId: new ObjectId(input.projectId),
    name: input.name,
    size: input.size,
    mimeType: input.mimeType,
    storageKey: input.storageKey,
    url: input.url,
    uploadedBy: new ObjectId(input.uploadedBy),
    createdAt: now,
    // Flow Integration Phase 8 (§5, item 1): only written when supplied —
    // legacy uploads store no extra keys, keeping stored docs byte-identical.
    ...(input.userId ? { userId: new ObjectId(input.userId) } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
  }
  const result = await db.collection(COLLECTIONS.DOCUMENTS).insertOne(doc)
  const created = toDocument({ ...doc, _id: result.insertedId })

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
  return toDocument(document)
}

// Store-level listing (QA C2): the app's document store needs one fetch that
// returns documents across all projects the requester can see. Previously the
// store initialized with a no-project call that returned [] by construction,
// so every uploaded document vanished from the UI after a reload.
export async function getAllDocuments(): Promise<Document[]> {
  const db = await getDb()
  const documents = await db.collection(COLLECTIONS.DOCUMENTS).find({}).sort({ createdAt: -1 }).toArray()
  return documents.map(toDocument)
}

export async function getDocumentsByProjectIds(projectIds: string[]): Promise<Document[]> {
  if (projectIds.length === 0) return []
  const db = await getDb()
  const documents = await db
    .collection(COLLECTIONS.DOCUMENTS)
    .find({ projectId: { $in: projectIds.map((id) => new ObjectId(id)) } })
    .sort({ createdAt: -1 })
    .toArray()
  return documents.map(toDocument)
}

// Flow Integration Phase 8 (§5, item 1) — onboarding checklist listing: all
// documents tagged with a subject `userId`, newest first, optionally narrowed
// to one kind. Backed by the additive `documents.userId` index (ensureIndexes);
// untagged legacy docs simply never match, which keeps old responses unchanged.
export async function getDocumentsByUserId(userId: string, kind?: DocumentKind): Promise<Document[]> {
  const db = await getDb()
  const query: Record<string, unknown> = { userId: new ObjectId(userId) }
  if (kind) query.kind = kind
  const documents = await db.collection(COLLECTIONS.DOCUMENTS).find(query).sort({ createdAt: -1 }).toArray()
  return documents.map(toDocument)
}
