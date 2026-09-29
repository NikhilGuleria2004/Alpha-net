import { z } from 'zod'

export const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number]

/**
 * Validates calendar date YYYY-MM-DD (e.g. rejects 2026-02-31).
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const [year, month, day] = dateStr.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const d = new Date(Date.UTC(year, month - 1, day))
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  )
}

const isoDate = z
  .string()
  .refine(isValidCalendarDate, 'Must be a valid calendar date (YYYY-MM-DD)')

/**
 * Returns the 3-letter day of week ('mon'..'sun') for a given YYYY-MM-DD string.
 * Uses UTC date parsing to prevent timezone boundary drift.
 */
export function getDayOfWeekFromDateString(dateStr: string): DayOfWeek {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  const dayIndex = d.getUTCDay() // 0 = Sun, 1 = Mon, ... 6 = Sat
  const mapping: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return mapping[dayIndex]
}

/**
 * Computes the Monday (weekStart) date string (YYYY-MM-DD) for any given YYYY-MM-DD.
 */
export function getWeekStartFromDateString(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  const dayIndex = d.getUTCDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffDays = dayIndex === 0 ? -6 : 1 - dayIndex
  d.setUTCDate(d.getUTCDate() + diffDays)
  return d.toISOString().slice(0, 10)
}

export const createDailyTimesheetSchema = z
  .object({
    projectId: z.string().min(1, 'Project ID is required'),
    assignmentId: z.string().min(1, 'Assignment ID must be valid').optional(),
    date: isoDate,
    dayOfWeek: z.enum(DAYS_OF_WEEK).optional(),
    hours: z
      .number({ invalid_type_error: 'Hours must be a number' })
      .min(0.25, 'Hours must be at least 0.25')
      .max(24, 'Hours cannot exceed 24'),
    entryType: z.enum(['regular', 'overtime'], {
      errorMap: () => ({ message: 'Entry type must be "regular" or "overtime"' }),
    }).default('regular'),
    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(3, 'Description must be at least 3 characters')
      .max(1000, 'Description cannot exceed 1000 characters'),
  })
  .refine(
    (data) => {
      if (!data.dayOfWeek) return true
      const computedDay = getDayOfWeekFromDateString(data.date)
      return data.dayOfWeek === computedDay
    },
    {
      message: 'dayOfWeek does not match the provided date',
      path: ['dayOfWeek'],
    }
  )

export const updateDailyTimesheetSchema = z
  .object({
    hours: z
      .number({ invalid_type_error: 'Hours must be a number' })
      .min(0.25, 'Hours must be at least 0.25')
      .max(24, 'Hours cannot exceed 24')
      .optional(),
    entryType: z.enum(['regular', 'overtime']).optional(),
    description: z
      .string()
      .trim()
      .min(1, 'Description is required')
      .max(2000, 'Description cannot exceed 2000 characters')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided to update',
  })

export const queryDailyTimesheetSchema = z
  .object({
    date: isoDate.optional(),
    weekStart: isoDate.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    projectId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    weeklyTimesheetId: z.string().min(1).optional(),
    status: z.enum(['draft', 'locked']).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate
      }
      return true
    },
    {
      message: 'startDate must be on or before endDate',
      path: ['endDate'],
    }
  )

export type CreateDailyTimesheetInput = z.infer<typeof createDailyTimesheetSchema>
export type UpdateDailyTimesheetInput = z.infer<typeof updateDailyTimesheetSchema>
export type QueryDailyTimesheetInput = z.infer<typeof queryDailyTimesheetSchema>

/**
 * ts.md Phase 4 — request body for the manual compile endpoint
 * (`POST /api/v1/timesheets/daily/compile`). `date` is accepted as a
 * convenience alternative to `weekStart`: the containing week is derived with
 * the same Monday-snapping rule the auto-compile hook uses. `userId` defaults
 * to the caller and may only point elsewhere for an admin or that user's
 * supervisor (enforced in the controller, which has the actor's identity).
 */
export const compileDailyTimesheetSchema = z
  .object({
    projectId: z.string().min(1, 'Project ID is required'),
    weekStart: isoDate.optional(),
    date: isoDate.optional(),
    userId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.weekStart || data.date), {
    message: 'weekStart (Monday, YYYY-MM-DD) or date is required',
    path: ['weekStart'],
  })

export type CompileDailyTimesheetInput = z.infer<typeof compileDailyTimesheetSchema>

