import { z } from 'zod'

/**
 * Flow Integration Phase 6 — payroll request schemas (see /flowIntegration.md
 * §5 Phase 6).
 *
 * Same hard rule as the invoice schemas: server-computed money fields
 * (`hours`, `payRate`, `grossPay`, `type`, `payRateMissing`, `status`,
 * timestamps) are deliberately ABSENT — a client can never supply what it is
 * paid. The service derives every one of them from the timesheet, assignment,
 * and resource records.
 */

/** 24-hex ObjectId string, the same id representation the other flow schemas use. */
const objectIdLike = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id')

/** YYYY-MM-DD, the same weekStart representation the timesheets collection uses. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')

/** Single collection status — mirrors the invoice lifecycle minus `sent`. */
export const payrollStatusSchema = z.enum(['draft', 'paid', 'void'])
export type PayrollStatusInput = z.infer<typeof payrollStatusSchema>

/** GET /payrolls — admin list with additive filters (§5 Phase 6 step 2). */
export const payrollListQuerySchema = z.object({
  resourceId: objectIdLike.optional(),
  assignmentId: objectIdLike.optional(),
  status: payrollStatusSchema.optional(),
  /** Inclusive lower bound on the payroll period's start (weekStart). */
  from: isoDate.optional(),
  /** Inclusive upper bound on the payroll period's start (weekStart). */
  to: isoDate.optional(),
})
export type PayrollListQuery = z.infer<typeof payrollListQuerySchema>

/** GET /payrolls/preview?timesheetId= — pure calculation, never writes. */
export const previewPayrollQuerySchema = z.object({
  timesheetId: objectIdLike,
})

/** POST /payrolls/from-timesheet (admin) — timesheetId is the only input. */
export const createPayrollSchema = z.object({
  timesheetId: objectIdLike,
})

/** POST /payrolls/:id/void (admin) — optional audit reason, like invoice void. */
export const voidPayrollSchema = z.object({
  reason: z.string().trim().max(200, 'Reason must be 200 characters or fewer').optional(),
})