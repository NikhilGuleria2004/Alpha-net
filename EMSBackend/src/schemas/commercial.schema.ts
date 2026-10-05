import { z } from 'zod'
import type { SupportedCurrencyCode } from '../types/auth.js'

/**
 * Zod schemas for the commercial routers (EMSBackend §7.6).
 * Mirrors EMSFrontend/src/services/commercialService.ts request shapes exactly.
 */

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, { message: 'Date must be a real calendar date' })

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a 24-char hex id')

const currencySchema = z.enum(['USD', 'INR', 'EUR', 'GBP']) satisfies z.ZodType<SupportedCurrencyCode>

// ── clients ──────────────────────────────────────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required').max(200),
  description: z.string().trim().max(1000).optional(),
  billingAddress: z.string().trim().max(500).optional(),
  paymentTerms: z.string().trim().max(100).optional(),
  contactEmail: z.string().trim().email('Must be a valid email').optional(),
  contactName: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(50).optional(),
  contractValue: z.number().nonnegative().optional(),
})

/**
 * An absent email is stored as '' (the legacy rows have no email), so an empty
 * string must satisfy the schema alongside `undefined`.
 */
const optionalEmail = z.union([z.literal(''), z.string().trim().email('Must be a valid email')]).optional()

export const createContactSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').max(200),
  email: optionalEmail.default(''),
  phone: z.string().trim().max(50).optional().default(''),
})

// ── projects ─────────────────────────────────────────────────────────────────

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, 'Project name is required').max(200),
    clientId: objectIdSchema,
    sowNumber: z.string().trim().min(1, 'SOW number is required').max(100),
    poCap: z.number().nonnegative().optional(),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    deadline: dateStringSchema.optional(),
    description: z.string().trim().max(2000).optional(),
    skillsRequired: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    billRateDefault: z.number().nonnegative().optional(),
    status: z.enum(['draft', 'active', 'completed', 'overdue', 'archived']).optional(),
    seats: z.number().int().min(1).max(1000).optional(),
    roleOnProject: z.string().trim().max(100).optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  })

// ── assignments ──────────────────────────────────────────────────────────────

export const createAssignmentSchema = z
  .object({
    userId: objectIdSchema,
    projectId: objectIdSchema,
    billRate: z.number().nonnegative('Bill rate cannot be negative'),
    payRate: z.number().nonnegative('Pay rate cannot be negative').optional(),
    currency: currencySchema.optional(),
    ftePercent: z.number().min(0).max(100).optional(),
    roleOnProject: z.string().trim().max(100).optional(),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  })
  .refine((value) => value.billRate > 0 || (value.payRate ?? 0) === 0, {
    message: 'A zero bill rate cannot carry a pay rate',
    path: ['billRate'],
  })

export const assignmentListQuerySchema = z.object({
  userId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  status: z.enum(['proposed', 'active', 'ending_soon', 'ended']).optional(),
})

export const projectListQuerySchema = z.object({
  clientId: objectIdSchema.optional(),
  status: z.enum(['draft', 'active', 'completed', 'overdue', 'archived']).optional(),
})

export type CreateClientInput = z.infer<typeof createClientSchema>
export type CreateContactInput = z.infer<typeof createContactSchema>
export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>