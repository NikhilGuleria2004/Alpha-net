import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sowNumber: z.string().min(1, 'SOW number is required'),
  client: z.string().min(1, 'Client is required'),
  description: z.string().min(1, 'Description is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  deadline: z.string().min(1, 'Deadline is required'),
  status: z.enum(['draft', 'active', 'completed', 'overdue', 'archived']),
  managerId: z.string().min(1, 'Manager is required'),
  supervisorId: z.string().min(1, 'Supervisor is required'),
  teamMemberIds: z.array(z.string()).min(1, 'At least one team member is required'),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  sowNumber: z.string().min(1, 'SOW number is required').optional(),
  client: z.string().min(1, 'Client is required').optional(),
  description: z.string().min(1, 'Description is required').optional(),
  startDate: z.string().min(1, 'Start date is required').optional(),
  endDate: z.string().min(1, 'End date is required').optional(),
  deadline: z.string().min(1, 'Deadline is required').optional(),
  status: z.enum(['draft', 'active', 'completed', 'overdue', 'archived']).optional(),
  managerId: z.string().min(1, 'Manager is required').optional(),
  supervisorId: z.string().min(1, 'Supervisor is required').optional(),
  teamMemberIds: z.array(z.string()).optional(),
})

export const addTeamMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
})

export const assignProjectSupervisorSchema = z.object({
  supervisorId: z.string().min(1, 'Supervisor ID is required'),
})
