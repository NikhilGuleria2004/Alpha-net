export type ProjectStatus = 'draft' | 'active' | 'completed' | 'overdue' | 'archived'

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface Project {
  id: string
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
  documentIds: string[]
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
