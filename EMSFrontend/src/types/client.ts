/**
 * Clients domain (EMSFrontend.md §7.6).
 *
 * Adds the EMS-owned `clientCode` (`CL-2026-###`, §17 D-5) on top of the
 * sibling `Client` shape so both apps keep reading the same `clients`
 * collection: the code is the human handle, `id` stays the join key, and
 * `normalizedName` remains the server-maintained dedup key (never send back).
 */

export interface Client {
  id: string
  /** Human-readable handle, e.g. `CL-2026-001`. Unique, generated server-side. */
  clientCode: string
  name: string
  normalizedName: string
  description?: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
  /** `synced` once the row is visible to the timesheet platform (shared DB). */
  syncStatus: 'synced' | 'pending' | 'error'
  createdAt: string
  updatedAt: string
}

export interface CreateClientInput {
  name: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
}

/** PATCH /clients/:id — partial update: only the keys present are written. */
export type UpdateClientInput = Partial<CreateClientInput>
