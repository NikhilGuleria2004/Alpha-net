import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { createActivity } from './activity.service.js'

// Flow Integration Phase 1 — Clients domain (see /flowIntegration.md §5 Phase 1).
// The `clients` collection normalizes the legacy free-text `projects.client`
// string. Names are deduplicated on normalized lowercase form so `Sony` and
// `sony` map to one client.

export interface Client {
  id: string
  name: string
  normalizedName: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateClientInput {
  name: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
}

export interface UpdateClientInput {
  name?: string
  billingAddress?: string
  paymentTerms?: string
  contactEmail?: string
}

export function normalizeClientName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

function toClient(doc: any): Client {
  return {
    id: doc._id.toString(),
    name: doc.name,
    normalizedName: doc.normalizedName,
    billingAddress: doc.billingAddress ?? undefined,
    paymentTerms: doc.paymentTerms ?? undefined,
    contactEmail: doc.contactEmail ?? undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function listClients(): Promise<Client[]> {
  const db = await getDb()
  const clients = await db.collection(COLLECTIONS.CLIENTS).find({}).sort({ name: 1 }).toArray()
  return clients.map(toClient)
}

export async function getClientById(id: string): Promise<Client | null> {
  const db = await getDb()
  if (!ObjectId.isValid(id)) return null
  const doc = await db.collection(COLLECTIONS.CLIENTS).findOne({ _id: new ObjectId(id) })
  if (!doc) return null
  return toClient(doc)
}

export async function getClientByName(name: string): Promise<Client | null> {
  const db = await getDb()
  const doc = await db
    .collection(COLLECTIONS.CLIENTS)
    .findOne({ normalizedName: normalizeClientName(name) })
  if (!doc) return null
  return toClient(doc)
}

// Upsert by normalized name: returns the existing client when one matches,
// otherwise creates it. Idempotent — safe for backfills and dual code paths.
export async function findOrCreateClient(
  input: CreateClientInput,
  actorUserId?: string,
): Promise<Client> {
  const db = await getDb()
  const normalizedName = normalizeClientName(input.name)
  if (!normalizedName) throw new Error('Client name is required')
  const existing = await db.collection(COLLECTIONS.CLIENTS).findOne({ normalizedName })
  if (existing) return toClient(existing)
  const now = new Date()
  const doc: Record<string, any> = {
    name: input.name.trim(),
    normalizedName,
    createdAt: now,
    updatedAt: now,
  }
  if (input.billingAddress !== undefined) doc.billingAddress = input.billingAddress
  if (input.paymentTerms !== undefined) doc.paymentTerms = input.paymentTerms
  if (input.contactEmail !== undefined) doc.contactEmail = input.contactEmail
  const result = await db.collection(COLLECTIONS.CLIENTS).insertOne(doc)
  const client = toClient({ ...doc, _id: result.insertedId })
  if (actorUserId) {
    await createActivity({
      userId: actorUserId,
      description: `Client "${client.name}" was created.`,
    })
  }
  return client
}

export async function createClient(input: CreateClientInput, actorUserId?: string): Promise<Client> {
  return findOrCreateClient(input, actorUserId)
}

export async function updateClient(id: string, input: UpdateClientInput): Promise<Client | null> {
  const db = await getDb()
  if (!ObjectId.isValid(id)) return null
  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) {
    const trimmed = input.name.trim()
    if (!trimmed) throw new Error('Client name is required')
    update.name = trimmed
    update.normalizedName = normalizeClientName(trimmed)
  }
  if (input.billingAddress !== undefined) update.billingAddress = input.billingAddress
  if (input.paymentTerms !== undefined) update.paymentTerms = input.paymentTerms
  if (input.contactEmail !== undefined) update.contactEmail = input.contactEmail
  const result = await db
    .collection(COLLECTIONS.CLIENTS)
    .findOneAndUpdate({ _id: new ObjectId(id) }, { $set: update }, { returnDocument: 'after' })
  if (!result) return null
  return toClient(result)
}
