import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import type { CreateDocumentInput, DocumentKind, DocumentStatus, EmsDocument } from '../types/document.js'

/**
 * Build the frontend `EmsDocument` shape from a raw `documents` row.
 *
 * Shared with the platform backend: `uploadedBy` is stored as an ObjectId (the
 * platform's own convention, indexed) and surfaced here as a string id. The
 * resolved display name is added as `uploadedByName`, which is additive.
 */
export function toEmsDocument(doc: Record<string, any>, uploadedByName?: string): EmsDocument {
  return {
    id: String(doc._id),
    userId: doc.userId ? String(doc.userId) : '',
    kind: (doc.kind as DocumentKind) ?? 'other',
    name: doc.name ?? '',
    size: doc.size ?? 0,
    mimeType: doc.mimeType ?? 'application/octet-stream',
    storageKey: doc.storageKey ?? '',
    url: doc.url || undefined,
    status: deriveDocumentStatus(doc),
    expiresAt: doc.expiryAt || undefined,
    uploadedBy: doc.uploadedBy ? String(doc.uploadedBy) : '',
    uploadedByName: uploadedByName || undefined,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
  }
}

/**
 * `status` is stored, but an `expiryAt` in the past overrides it to `expired` so
 * the HR expiry widget reflects reality without a scheduled job.
 */
function deriveDocumentStatus(doc: Record<string, any>): DocumentStatus {
  if (doc.expiryAt) {
    const today = new Date().toISOString().slice(0, 10)
    if (doc.expiryAt < today) {
      return 'expired'
    }
  }
  return (doc.status as DocumentStatus) ?? 'pending'
}

export interface DocumentListFilters {
  type?: string
  userId?: string
}

/**
 * GET /documents — self-scoped for employees, org-wide for hr/admin
 * (§7.5 "self-or-hr,admin").
 */
export async function listDocuments(
  requesterId: string,
  requesterRole: string,
  filters: DocumentListFilters = {},
): Promise<{ documents: EmsDocument[]; total: number }> {
  const db = await getDb()
  const isReviewer = requesterRole === 'admin' || requesterRole === 'hr'

  const query: Record<string, any> = {}
  if (!isReviewer) {
    // Employees see their own documents plus any they uploaded for others.
    query.$or = [{ userId: new ObjectId(requesterId) }, { uploadedBy: new ObjectId(requesterId) }]
  } else if (filters.userId) {
    query.userId = new ObjectId(filters.userId)
  }
  if (filters.type) {
    query.kind = filters.type
  }

  const docs = await db
    .collection(COLLECTIONS.DOCUMENTS)
    .find(query)
    .sort({ createdAt: -1 })
    .toArray()
  const names = await resolveUploaderNames(db, docs)

  return {
    documents: docs.map((doc: Record<string, any>) => toEmsDocument(doc, names.get(String(doc.uploadedBy)))),
    total: docs.length,
  }
}

async function resolveUploaderNames(db: any, docs: Record<string, any>[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const ids = [...new Set(docs.map((doc) => String(doc.uploadedBy)))]
  const validIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
  if (validIds.length === 0) {
    return names
  }
  const users = await db
    .collection(COLLECTIONS.USERS)
    .find({ _id: { $in: validIds } })
    .project({ name: 1 })
    .toArray()
  for (const user of users) {
    names.set(String(user._id), user.name ?? '')
  }
  return names
}

/** Build the platform-compatible storage key for an HR document. */
function buildStorageKey(userId: string, name: string): string {
  const sanitized =
    name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      // Collapse dot runs and strip leading dots/dashes so no `..` segment can
      // survive into a key that later becomes a blob path.
      .replace(/\.{2,}/g, '.')
      .replace(/^[.-]+/, '')
      .slice(0, 120) || 'document'
  return `documents/ems/${userId}/${Date.now()}-${sanitized}`
}

/**
 * POST /documents — metadata-first (§7.5). Validates the metadata, then writes
 * only the metadata row: name, kind, userId, expiryAt?, storageKey (plus size /
 * mimeType / uploadedBy so the frontend contract is satisfied).
 *
 * Byte persistence is intentionally NOT done here: the shared `documents`
 * collection's blob lives in the platform backend's Vercel Blob store, and
 * storing bytes without that store would produce rows whose `storageKey` points
 * at nothing. Phase 8 wires the store; until then the row is the source of
 * truth for metadata and the expiry/verification widgets.
 */
export async function createDocument(
  uploaderId: string,
  uploaderName: string,
  input: CreateDocumentInput,
): Promise<EmsDocument> {
  const db = await getDb()

  // HR may file a document on behalf of an employee; otherwise it is self.
  const targetUserId = input.userId || uploaderId
  if (!ObjectId.isValid(targetUserId)) {
    const err: any = new Error('Invalid userId')
    err.code = 'VALIDATION_ERROR'
    throw err
  }

  const now = new Date()
  const doc = {
    userId: new ObjectId(targetUserId),
    kind: input.kind,
    name: input.name,
    size: input.size,
    mimeType: input.mimeType,
    storageKey: buildStorageKey(targetUserId, input.name),
    expiryAt: input.expiryAt ?? null,
    // Platform convention: ObjectId, indexed by the platform backend.
    uploadedBy: new ObjectId(uploaderId),
    status: 'pending',
    projectId: null,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection(COLLECTIONS.DOCUMENTS).insertOne(doc)

  await createActivity({
    userId: uploaderId,
    description: `Document uploaded: ${input.name}`,
    entityType: 'document',
    entityId: result.insertedId.toString(),
  })

  logger.info({ uploaderId, targetUserId, kind: input.kind }, 'document metadata stored')

  return toEmsDocument({ ...doc, _id: result.insertedId }, uploaderName)
}