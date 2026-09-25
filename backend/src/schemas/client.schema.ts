import { z } from 'zod'

// Flow Integration Phase 1 — Clients domain (see /flowIntegration.md §5 Phase 1).
// Normalizes the legacy free-text `projects.client` string into a `clients`
// collection so Phase 3 assignments can hold a `clientId` FK.
// All fields except `name` are optional to stay backward-compatible.

export const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required').max(200),
  billingAddress: z.string().trim().max(500).optional(),
  paymentTerms: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().toLowerCase().email('Valid contact email is required').optional(),
})

export const updateClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required').max(200).optional(),
  billingAddress: z.string().trim().max(500).optional(),
  paymentTerms: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().toLowerCase().email('Valid contact email is required').optional(),
})

export type CreateClientInput = z.infer<typeof createClientSchema>
export type UpdateClientInput = z.infer<typeof updateClientSchema>
