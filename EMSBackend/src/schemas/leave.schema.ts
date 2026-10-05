import { z } from 'zod'
import type { LeaveType } from '../types/leave.js'

/**
 * Zod schemas for leave routes (EMSBackend §7.5).
 * Mirrors EMSFrontend/src/services/hrService.ts leave boundaries.
 */

export const LEAVE_TYPES = [
  'vacation',
  'sick',
  'personal',
  'unpaid',
  'maternity',
  'paternity',
] as const satisfies readonly LeaveType[]

export const leaveTypeSchema = z.enum(LEAVE_TYPES)

/**
 * Real calendar validation, not just a YYYY-MM-DD shape check: `2026-02-31`
 * matches the regex but is not a date. Rejects impossible days.
 */
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  },
  { message: 'Date must be a real calendar date' },
)

export const createLeaveSchema = z
  .object({
    type: leaveTypeSchema,
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    reason: z.string().trim().max(500).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  })

/**
 * Reviewable terminal states only — a request cannot be moved back to `pending`
 * through this endpoint (§7.5 review transition).
 */
export const reviewLeaveSchema = z.object({
  status: z.enum(['approved', 'rejected', 'cancelled']),
  note: z.string().trim().max(1000).optional(),
})

export const leaveListQuerySchema = z.object({
  type: leaveTypeSchema.optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'userId must be a 24-char hex id').optional(),
})

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>
export type ReviewLeaveInput = z.infer<typeof reviewLeaveSchema>