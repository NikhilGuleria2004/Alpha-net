import { z } from 'zod'

export const createTimesheetSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  weekStart: z.string().min(1, 'Week start is required'),
  entries: z.array(z.any()),
  notes: z.string().optional(),
})

export const updateTimesheetSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required').optional(),
  weekStart: z.string().min(1, 'Week start is required').optional(),
  entries: z.array(z.any()).min(1, 'At least one entry is required').optional(),
  notes: z.string().optional(),
})

export const submitTimesheetSchema = z.object({})

export const withdrawTimesheetSchema = z.object({
  reason: z.string().optional(),
})

export const approveTimesheetSchema = z.object({})

export const declineTimesheetSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
})
