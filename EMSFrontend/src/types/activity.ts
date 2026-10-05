/**
 * Activity / audit timeline (EMSFrontend.md §7.5 detail tabs, dashboards).
 *
 * Append-only feed rendered by `TimelineRail`. Mirrors the sibling `Activity`
 * shape with an EMS `actorId` + human `actorName` so the rail never needs a
 * user lookup per row.
 */

export type ActivityKind =
  | 'onboarding'
  | 'payrate'
  | 'assignment'
  | 'attendance'
  | 'client'
  | 'project'
  | 'document'
  | 'user'

export interface Activity {
  id: string
  kind: ActivityKind
  actorId: string
  actorName: string
  description: string
  relatedId?: string
  createdAt: string
}
