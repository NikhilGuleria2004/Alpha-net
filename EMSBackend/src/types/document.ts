/**
 * Documents domain types (EMSBackend §5.2, §7.5).
 *
 * The `documents` collection is SHARED with the timesheet platform backend, so
 * writes stay additive: the platform's own fields (projectId, uploadedBy as an
 * ObjectId, url) are preserved untouched and EMS only adds userId/kind/expiryAt.
 * Mirrors EMSFrontend/src/types/document.ts at the API boundary.
 */

export type DocumentKind = 'id_proof' | 'contract' | 'tax_form' | 'visa' | 'other'

export type DocumentStatus = 'pending' | 'verified' | 'expired'

export interface EmsDocument {
  id: string
  userId: string
  kind: DocumentKind
  name: string
  size: number
  mimeType: string
  storageKey: string
  url?: string
  status: DocumentStatus
  expiresAt?: string
  uploadedBy: string
  uploadedByName?: string
  createdAt: string
}

export interface CreateDocumentInput {
  kind: DocumentKind
  name: string
  userId: string
  size: number
  mimeType: string
  expiryAt?: string
}