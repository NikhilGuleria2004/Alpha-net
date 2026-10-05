export type ProjectStatus = 'draft' | 'active' | 'completed' | 'overdue' | 'archived'

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface Project {
  id: string
  name: string
  sowNumber: string
  client: string
  // Flow Integration Phase 1: optional FK to the normalized clients collection.
  // Undefined for legacy projects until the Phase 1 backfill runs.
  clientId?: string
  description: string
  startDate: string
  endDate: string
  deadline: string
  status: ProjectStatus
  managerId: string
  supervisorId: string
  teamMemberIds: string[]
  hourlyRate?: number | null
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  sowNumber: string
  client: string
  description: string
  startDate: string
  endDate: string
  deadline: string
  status: ProjectStatus
  managerId: string
  supervisorId: string
  teamMemberIds: string[]
}
