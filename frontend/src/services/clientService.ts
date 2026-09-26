import type { Client, CreateClientInput, UpdateClientInput } from '../types/client'
import apiClient from './apiClient'

// Flow Integration Phase 1 — Clients API (backend/src/routes/clients.ts).
// Reads (GET /clients, GET /clients/:id) are available to any authenticated
// user; writes (POST, PATCH) are admin-only (enforced by requireAdmin, so a
// non-admin gets a [FORBIDDEN] error from apiClient).

export async function getClients(): Promise<Client[]> {
  const response = await apiClient.get<{ clients: Client[] }>('/clients')
  return response.clients
}

export async function getClientById(id: string): Promise<Client | undefined> {
  const response = await apiClient.get<{ client: Client }>(`/clients/${id}`)
  return response.client
}

// Backend behaviour: POST /clients upserts by normalized name (findOrCreateClient),
// so posting an existing name returns that same client instead of a duplicate.
export async function createClient(data: CreateClientInput): Promise<Client> {
  const response = await apiClient.post<{ client: Client }>('/clients', data)
  return response.client
}

export async function updateClient(id: string, data: UpdateClientInput): Promise<Client | undefined> {
  const response = await apiClient.patch<{ client: Client }>(`/clients/${id}`, data)
  return response.client
}

// Client-side search over the directory, mirroring searchUsers/searchProjects —
// GET /clients has no server-side `q` parameter.
export async function searchClients(query: string): Promise<Client[]> {
  const all = await getClients()
  const lower = query.trim().toLowerCase()
  if (!lower) return all
  return all.filter(
    (client) =>
      client.name.toLowerCase().includes(lower) ||
      (client.contactEmail ?? '').toLowerCase().includes(lower),
  )
}
