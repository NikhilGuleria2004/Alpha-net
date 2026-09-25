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

// Flow Integration Phase 4 (see /flowIntegration.md §5): `projectId` becomes
// optional ONLY because it can be inferred from `assignmentId`; when neither is
// sent the service still answers "Project ID is required" (same 400 as before).
// `assignmentId`/`adjustmentOf` are new optional keys — legacy payloads parse
// exactly as before.
export const createTimesheetSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required').optional(),
  weekStart: z.string().min(1, 'Week start is required'),
  entries: z.array(timesheetEntrySchema).min(1, 'At least one entry is required'),
  notes: z.string().optional(),
  assignmentId: z.string().min(1, 'Assignment ID is required').optional(),
  adjustmentOf: z.string().min(1, 'Adjustment reference is required').optional(),
})

export const updateTimesheetSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required').optional(),
  weekStart: z.string().min(1, 'Week start is required').optional(),
  entries: z.array(timesheetEntrySchema).min(1, 'At least one entry is required').optional(),
  notes: z.string().optional(),
  // Accepted for validation only: the service rejects any change to it
  // (assignmentId is immutable after create, like weekStart).
  assignmentId: z.string().min(1, 'Assignment ID is required').optional(),
})

export const submitTimesheetSchema = z.object({})

export const withdrawTimesheetSchema = z.object({
  reason: z.string().optional(),
})

export const approveTimesheetSchema = z.object({})

export const declineTimesheetSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
})
