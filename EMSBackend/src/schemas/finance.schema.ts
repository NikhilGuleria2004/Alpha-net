import { z } from 'zod'

/**
 * Finance + system schemas (EMSBackend §7.7–7.9).
 *
 * Query objects are `.passthrough()`-tolerant via explicit optionals only —
 * unknown keys are stripped, so a client sending extra fields cannot smuggle a
 * filter past the guards below.
 */

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id')

/** `YYYY-MM` pay-period key. */
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM')

export const payrollQuerySchema = z.object({
  period: periodSchema.optional(),
  format: z.enum(['csv', 'pdf']).optional(),
})

export const closePayrollSchema = z.object({
  period: periodSchema,
})

export const reportQuerySchema = z.object({
  dateRange: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
  projectId: objectIdSchema.optional(),
  userId: objectIdSchema.optional(),
  department: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['all', 'approved', 'pending', 'declined', 'withdrawn', 'draft']).optional(),
})

export type ReportQueryInput = z.infer<typeof reportQuerySchema>

// ── settings ──────────────────────────────────────────────────────────────────

export const updateOrgSettingsSchema = z.object({
  orgName: z.string().trim().min(1, 'Organization name is required').max(200),
  showBillRateToEmployee: z.boolean(),
  leavePolicy: z.object({
    annualLeaveDays: z.number().int().min(0).max(365),
    sickLeaveDays: z.number().int().min(0).max(365),
    lockAfterApproval: z.boolean(),
  }),
  approvalChain: z.array(z.enum(['manager', 'hr', 'admin'])).min(1).max(5),
})

export const updateMySettingsSchema = z.object({
  phone: z.string().trim().max(30).optional(),
  notifications: z
    .object({
      inApp: z.boolean(),
      email: z.boolean(),
    })
    .optional(),
})

// ── audit ─────────────────────────────────────────────────────────────────────

export const auditQuerySchema = z.object({
  entityType: z.string().trim().min(1).max(50).optional(),
  entityId: objectIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  // No upper bound here on purpose: the service clamps to100 rather than
  // erroring, so an over-eager client still gets a usable page.
  limit: z.coerce.number().int().min(1).default(25),
})

export type AuditQueryInput = z.infer<typeof auditQuerySchema>