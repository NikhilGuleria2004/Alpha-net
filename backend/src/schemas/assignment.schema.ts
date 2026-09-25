import { z } from 'zod'

// Flow Integration Phase 3 — Assignments domain (see /flowIntegration.md §5
// Phase 3). An assignment links one resource (user) to one project for a
// client, carrying the bill/pay rates and validity window that timesheets,
// invoices and payroll all hang off.
//
// Backward compatibility: this is a NEW collection with no legacy writer, so
// every field below had to be a deliberate choice. `resourceId`/`projectId`
// are the only identity fields; they are deliberately NOT updatable via
// `updateAssignmentSchema` because later phases key timesheets/payrolls off
// the (resource, project) pair.

/** YYYY-MM-DD, the same date representation projects/timesheets use. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')

export const ASSIGNMENT_STATUSES = ['active', 'onHold', 'completed', 'terminated'] as const
export const BILLING_TYPES = ['hourly', 'fixed', 'monthly'] as const

export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES)
export const billingTypeSchema = z.enum(BILLING_TYPES)

/** 24-hex ObjectId string. Kept loose enough for legacy string ids. */
const objectIdLike = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id')

const nonNegativeMoney = (label: string) =>
  z.coerce
    .number()
    .refine((value) => Number.isFinite(value), `${label} must be a finite number`)
    .refine((value) => value >= 0, `${label} must be 0 or greater`)

export const createAssignmentSchema = z
  .object({
    resourceId: objectIdLike,
    projectId: objectIdLike,
    // Optional FKs; the service inherits project.clientId or upserts from the
    // legacy project.client string when omitted (never fails legacy callers).
    clientId: objectIdLike.optional(),
    poSow: z.string().trim().max(200).optional(),
    approverId: objectIdLike.optional(),
    billingEntity: z.string().trim().max(200).optional(),
    startDate: isoDate,
    endDate: isoDate,
    billRate: nonNegativeMoney('billRate'),
    payRate: nonNegativeMoney('payRate'),
    billingType: billingTypeSchema.optional(),
    timesheetRequired: z.boolean().optional(),
    approvalRequired: z.boolean().optional(),
    status: assignmentStatusSchema.optional(),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate'],
  })

export const updateAssignmentSchema = z
  .object({
    clientId: objectIdLike.optional(),
    poSow: z.string().trim().max(200).optional(),
    approverId: objectIdLike.optional(),
    billingEntity: z.string().trim().max(200).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    billRate: nonNegativeMoney('billRate').optional(),
    payRate: nonNegativeMoney('payRate').optional(),
    billingType: billingTypeSchema.optional(),
    timesheetRequired: z.boolean().optional(),
    approvalRequired: z.boolean().optional(),
    status: assignmentStatusSchema.optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['endDate'],
  })

export const terminateAssignmentSchema = z.object({
  endDate: isoDate.optional(),
})

export const assignmentListQuerySchema = z.object({
  resourceId: objectIdLike.optional(),
  projectId: objectIdLike.optional(),
  clientId: objectIdLike.optional(),
  status: assignmentStatusSchema.optional(),
})

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export type AssignmentListQuery = z.infer<typeof assignmentListQuerySchema>
