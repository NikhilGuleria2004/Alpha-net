import { z } from 'zod'

/**
 * Zod schemas for document routes (EMSBackend §7.5).
 *
 * `POST /documents` is multipart, so body fields arrive as strings. The
 * multipart text fields are validated here; the binary itself is bounded by the
 * multer limits in routes/documents.ts.
 */

export const documentKindSchema = z.enum(['id_proof', 'contract', 'tax_form', 'visa', 'other'])

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, { message: 'Date must be a real calendar date' })

/** Multipart text fields accompanying the uploaded file. */
export const createDocumentSchema = z.object({
  kind: documentKindSchema,
  name: z.string().trim().min(1).max(200).optional(),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'userId must be a 24-char hex id').optional(),
  expiryAt: dateStringSchema.optional(),
})

/** GET /documents?type=<DocumentKind> */
export const documentListQuerySchema = z.object({
  type: documentKindSchema.optional(),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'userId must be a 24-char hex id').optional(),
})

export type CreateDocumentMultipart = z.infer<typeof createDocumentSchema>