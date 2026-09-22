import { z } from 'zod'

/**
 * invonb.md §1 / Phase A item A1 — Invoicing request schemas.
 *
 * Server-computed fields (fixedCost, variableCostTotal, total, invoiceNumber,
 * status, sentAt, billableHours) are deliberately ABSENT from these schemas:
 * the client may never supply them. The service derives every one of them, so
 * a forged body cannot alter what the customer is billed.
 *
 * `hourlyRate` IS accepted as an explicit override (the admin may bill at a
 * rate different from the project's default); it is snapshotted on the
 * invoice, and fixedCost is always recomputed from it server-side.
 *
 * `weekStart` is accepted for API compatibility only — invoices now cover the
 * project's TOTAL logged hours. The service derives the billing period from
 * the project's timesheets and only uses weekStart as a fallback when the
 * project has none.
 */

/** YYYY-MM-DD, the same weekStart representation the timesheets collection uses. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)')

export const variableCostItemSchema = z.object({
  amount: z.coerce
    .number()
    .refine((value) => Number.isFinite(value), 'Amount must be a finite number')
    .refine((value) => value !== 0, 'Amount must not be zero'),
  reason: z
    .string()
    .trim()
    .min(1, 'A reason is required for every variable cost')
    .max(200, 'Reason must be 200 characters or fewer'),
})

export const insertInvoiceSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  weekStart: isoDate.optional(),
  hourlyRate: z.coerce
    .number()
    .refine((value) => Number.isFinite(value), 'Hourly rate must be a finite number')
    .refine((value) => value >= 0, 'Hourly rate must be 0 or greater')
    .optional(),
  /**
   * Accepted for API symmetry only. The controller overwrites this with the
   * authenticated admin's id so an admin cannot forge another admin's name
   * into the audit trail.
   */
  adminUserId: z.string().min(1).optional(),
})

export const updateInvoiceSchema = z
  .object({
    hourlyRate: z.coerce
      .number()
      .refine((value) => Number.isFinite(value), 'Hourly rate must be a finite number')
      .refine((value) => value >= 0, 'Hourly rate must be 0 or greater')
      .optional(),
    addVariableCosts: z.array(variableCostItemSchema).max(50, 'At most 50 variable costs per request').optional(),
    removeVariableCostIds: z.array(z.string().min(1)).max(50, 'At most 50 removals per request').optional(),
  })
  .refine(
    (value) =>
      value.hourlyRate !== undefined ||
      Boolean(value.addVariableCosts?.length) ||
      Boolean(value.removeVariableCostIds?.length),
    'Provide hourlyRate and/or addVariableCosts and/or removeVariableCostIds',
  )

export const sendInvoiceSchema = z.object({
  to: z.string().trim().toLowerCase().email('Valid recipient email is required').optional(),
})

export const invoiceListQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  status: z.enum(['draft', 'sent', 'paid', 'void']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
})

export type VariableCostInput = z.infer<typeof variableCostItemSchema>
export type InsertInvoiceInput = z.infer<typeof insertInvoiceSchema>
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>
