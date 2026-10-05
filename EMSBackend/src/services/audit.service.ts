import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import type { AuditEvent, AuditListResult, AuditSeverity } from '../types/system.js'

/**
 * Audit log (EMSBackend §7.9, task 7.4).
 *
 * Reads the shared append-only `activities` collection — the same feed the admin
 * dashboard's `recentAudit` widget pulls from, so both use one mapper and one
 * `AuditEvent` shape. Activities are written fire-and-forget by
 * `activity.service.ts`; EMS never mutates or deletes them.
 */

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

function toAuditEvent(doc: any, actorName?: string): AuditEvent {
  return {
    id: String(doc._id),
    description: doc.description ?? '',
    // `activities` stores the actor as `userId`; the older dashboard code read
    // a flat `actor` string. Prefer the resolved name, then that string.
    actor: actorName || doc.actor || 'System',
    timestamp: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
    severity: (doc.severity as AuditSeverity) ?? 'info',
  }
}

/**
 * GET /audit — newest-first, paginated. `total` is the full match count, not the
 * page length, so the admin pager can render correctly.
 */
export async function listAuditEvents(filters: {
  entityType?: string
  entityId?: string
  page?: number
  limit?: number
}): Promise<AuditListResult> {
  const db = await getDb()

  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT))

  const query: Record<string, any> = {}
  if (filters.entityType) query.entityType = filters.entityType
  if (filters.entityId && ObjectId.isValid(filters.entityId)) query.entityId = new ObjectId(filters.entityId)

  const [docs, total] = await Promise.all([
    db
      .collection(COLLECTIONS.ACTIVITIES)
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTIONS.ACTIVITIES).countDocuments(query),
  ])

  // One lookup for every distinct actor on this page.
  const actorIds = [
    ...new Set(
      docs
        .map((d: any) => (d.userId ? String(d.userId) : ''))
        .filter((id: string) => ObjectId.isValid(id)),
    ),
  ]
  const actors = actorIds.length
    ? await db
        .collection(COLLECTIONS.USERS)
        .find({ _id: { $in: actorIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1 })
        .toArray()
    : []
  const nameById = new Map(actors.map((u: any) => [String(u._id), u.name ?? '']))

  return {
    events: docs.map((doc: any) =>
      toAuditEvent(doc, doc.userId ? nameById.get(String(doc.userId)) : undefined),
    ),
    total,
    page,
    limit,
  }
}