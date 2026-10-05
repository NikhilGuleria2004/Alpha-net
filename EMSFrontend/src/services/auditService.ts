/**
 * Audit service — `GET /audit` (EMSFrontend.md §7.9, Appendix B `/admin/audit`).
 *
 * Admin-only on the backend (`requireRole('admin')`), reading the shared
 * append-only `activities` collection that also feeds the admin dashboard's
 * `recentAudit` widget — so both surfaces use one `AuditEvent` shape and one
 * mapper.
 *
 * Pagination is server-side: the backend skips/limits and returns `total` for
 * the full match count, so the page must not hand these rows to `Table`'s
 * client-side pager (see AuditLog.tsx).
 */
import { api } from './apiClient'
import type { AuditListResult } from '../types/dashboard'

/**
 * `entityType` values the backend actually writes to `activities`. Kept as a
 * literal union rather than reusing `ActivityKind` from types/activity.ts,
 * whose vocabulary differs from what `createActivity` is called with (it has
 * `onboarding`/`payrate` where the backend writes `onboarding_candidate`/
 * `payroll`, and omits `department`/`leave_request`/`settings` entirely).
 * `'all'` is a UI-only sentinel meaning "don't send the param".
 */
export const AUDIT_ENTITY_TYPES = [
  'all',
  'assignment',
  'attendance',
  'client',
  'department',
  'document',
  'leave_request',
  'onboarding_candidate',
  'payroll',
  'project',
  'settings',
  'user',
] as const

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

export interface AuditQuery {
  entityType?: string
  entityId?: string
  page?: number
  limit?: number
}

/** Human label for an `entityType` slug, for chips and the type column. */
export function auditEntityLabel(slug: string): string {
  return slug
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export async function getAuditEvents(query: AuditQuery = {}): Promise<AuditListResult> {
  const params = new URLSearchParams()
  if (query.entityType) params.set('entityType', query.entityType)
  if (query.entityId) params.set('entityId', query.entityId)
  if (query.page != null) params.set('page', String(query.page))
  if (query.limit != null) params.set('limit', String(query.limit))

  const qs = params.toString()
  return api.get<AuditListResult>(`/audit${qs ? `?${qs}` : ''}`)
}
