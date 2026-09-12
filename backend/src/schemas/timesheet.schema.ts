import { z } from 'zod'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const hoursSchema = z.object({
  mon: z.number().min(0).max(24),
  tue: z.number().min(0).max(24),
  wed: z.number().min(0).max(24),
  thu: z.number().min(0).max(24),
  fri: z.number().min(0).max(24),
  sat: z.number().min(0).max(24),
  sun: z.number().min(0).max(24),
})

const timesheetEntrySchema = z.object({
  id: z.string().min(1, 'Entry ID is required'),
  description: z.string().min(1, 'Entry description is required'),
  entryType: z.enum(['regular', 'overtime'], {
    errorMap: () => ({ message: 'Entry type must be "regular" or "overtime"' }),
  }),
  hours: hoursSchema,
})

export const createTimesheetSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  weekStart: z.string().min(1, 'Week start is required'),
  entries: z.array(timesheetEntrySchema).min(1, 'At least one entry is required'),
  notes: z.string().optional(),
})

export const updateTimesheetSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required').optional(),
  weekStart: z.string().min(1, 'Week start is required').optional(),
  entries: z.array(timesheetEntrySchema).min(1, 'At least one entry is required').optional(),
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
