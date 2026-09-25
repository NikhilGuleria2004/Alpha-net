import { z } from 'zod'

// Flow Integration Phase 8 — onboarding document metadata (flowIntegration.md
// §5 item 1). The docx enumerates the document kinds an onboarding checklist
// needs ("I-9, W-4, offer letter, other documents"); they are stored as an
// optional enum on documents alongside an optional subject `userId`. Both are
// additive: legacy documents/uploaders that never send them are unchanged.
export const DOCUMENT_KINDS = ['i9', 'w4', 'offer', 'other'] as const
export const documentKindSchema = z.enum(DOCUMENT_KINDS)
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

/** 24-hex ObjectId string — same loose validation as assignment.schema. */
const objectIdLike = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id')

/** GET /api/v1/documents filters (validated before the fetch; bad input → 400). */
export const documentListQuerySchema = z.object({
  userId: objectIdLike.optional(),
  kind: documentKindSchema.optional(),
})

/**
 * Optional multipart metadata on POST /:projectId/documents. Empty strings are
 * treated as "absent" by the controller before parsing, so plain form posts
 * from legacy uploaders keep storing documents without these keys.
 */
export const uploadDocumentMetaSchema = z.object({
  kind: documentKindSchema.optional(),
  userId: objectIdLike.optional(),
})

export type DocumentListQuery = z.infer<typeof documentListQuerySchema>