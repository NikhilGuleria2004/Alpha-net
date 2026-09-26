// Flow Integration Phase 1 — Clients domain (see /flowIntegration.md §5 Phase 1).
// Mirrors the backend shape in backend/src/services/client.service.ts. `clients`
// is the normalized form of the legacy free-text `projects.client` string.
export interface Client {
  id: string
  name: string
  // Server-maintained dedup key (lowercased, whitespace-collapsed name). Always
  // derived from `name` by the backend — never send it back.
  normalizedName: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
  createdAt: string
  updatedAt: string
}

export interface CreateClientInput {
  name: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
}

// PATCH /clients/:id is a partial update: only the keys present are written.
export type UpdateClientInput = Partial<CreateClientInput>
