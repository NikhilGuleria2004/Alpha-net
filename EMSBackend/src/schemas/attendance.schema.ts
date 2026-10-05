import { z } from 'zod'

/**
 * Zod schemas for attendance routes (EMSBackend §7.2).
 * Mirrors EMSFrontend/src/types/attendance.ts validation boundaries.
 */

const markableStatusSchema = z.enum(['present', 'remote', 'on_leave', 'half_day'])

export const markAttendanceSchema = z.object({
  status: markableStatusSchema,
  note: z.string().trim().max(500).optional(),
  location: z.string().trim().max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
})

export const attendanceDateQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
})

export const attendanceRangeQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start must be YYYY-MM-DD').optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End must be YYYY-MM-DD').optional(),
})

export const teamAttendanceQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  scope: z.enum(['team', 'department']).optional(),
})

export const teamHistoricQuerySchema = z.object({
  range: z.coerce.number().int().min(1).max(365).optional().default(7),
  anchor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Anchor must be YYYY-MM-DD').optional(),
})

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>
