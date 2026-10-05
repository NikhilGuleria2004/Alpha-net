/**
 * Documents domain (EMSFrontend.md §7.4 step 4, §7.5 detail tabs).
 *
 * HR-owned compliance artefacts (ID, contract, tax forms). Uploads are mocked
 * in the shell; the shape matches the sibling `Document` so the shared
 * `documents` collection stays readable from both apps.
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
  createdAt: string
}
