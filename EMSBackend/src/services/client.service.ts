import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import type {
  Client,
  ClientActivityEntry,
  ClientContact,
  CreateClientInput,
  Project,
} from '../types/commercial.js'

/**
 * Clients — EMS + platform shared collection (EMSBackend §7.6).
 *
 * Dual-write map (EMS write -> what the platform reads):
 *   name             -> `name`        (display)
 *   normalizedName   -> `normalizedName` (platform's unique dedup key)
 *   billingAddress / paymentTerms / contactEmail -> same names on the platform
 *   clientCode       -> EMS-only handle, indexed `clientCode!`
 *
 * The platform's `toClient` reads only name/normalizedName/billingAddress/
 * paymentTerms/contactEmail, so those five are the compatibility surface.
 */

const CODE_PREFIX = 'CL-'
const MAX_CODE_ATTEMPTS = 5

/** Mirror of the platform's `normalizeClientName` so dedup keys agree. */
export function normalizeClientName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

function toClient(doc: Record<string, any>): Client {
  return {
    id: String(doc._id),
    clientCode: doc.clientCode ?? '',
    name: doc.name ?? '',
    normalizedName: doc.normalizedName ?? '',
    description: doc.description || undefined,
    billingAddress: doc.billingAddress || undefined,
    paymentTerms: doc.paymentTerms || undefined,
    contactEmail: doc.contactEmail || undefined,
    // EMS writes straight into the shared collection, so the platform can read
    // the row the moment it is committed.
    syncStatus: 'synced',
    contactName: doc.contactName || undefined,
    contactPhone: doc.contactPhone || undefined,
    contractValue: doc.contractValue ?? undefined,
    status: doc.status || undefined,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : '',
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : '',
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

/**
 * Next `CL-YYYY-NNN` handle: reuse the existing sequence for the current year and
 * continue from the highest suffix in use. Falls back to 001 on a cold collection.
 */
async function nextClientCode(db: any): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `${CODE_PREFIX}${year}-`
  const latest = await db
    .collection(COLLECTIONS.CLIENTS)
    .find({ clientCode: { $regex: `^${prefix}\\d{3}$` } })
    .sort({ clientCode: -1 })
    .limit(1)
    .toArray()

  const last = latest[0]?.clientCode as string | undefined
  const nextSeq = last ? Number.parseInt(last.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(nextSeq).padStart(3, '0')}`
}

/** GET /clients — { clients, total } for admin/manager. */
export async function listClients(): Promise<{ clients: Client[]; total: number }> {
  const db = await getDb()
  const docs = await db.collection(COLLECTIONS.CLIENTS).find({}).sort({ name: 1 }).toArray()
  return { clients: docs.map(toClient), total: docs.length }
}

/**
 * POST /clients — server generates `clientCode`, seeds a `client_activity` row
 * (§7.6), and retries on a code collision.
 */
export async function createClient(input: CreateClientInput, actorId: string, actorName: string): Promise<Client> {
  const db = await getDb()
  const normalizedName = normalizeClientName(input.name)
  if (!normalizedName) {
    const err: any = new Error('Client name is required')
    err.code = 'VALIDATION_ERROR'
    throw err
  }

  const existing = await db.collection(COLLECTIONS.CLIENTS).findOne({ normalizedName })
  if (existing) {
    const err: any = new Error(`Client "${input.name}" already exists`)
    err.code = 'CLIENT_EXISTS'
    throw err
  }

  const now = new Date()
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const clientCode = await nextClientCode(db)
    const doc: Record<string, any> = {
      clientCode,
      name: input.name.trim(),
      normalizedName,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    if (input.description !== undefined) doc.description = input.description
    if (input.billingAddress !== undefined) doc.billingAddress = input.billingAddress
    if (input.paymentTerms !== undefined) doc.paymentTerms = input.paymentTerms
    if (input.contactEmail !== undefined) doc.contactEmail = input.contactEmail
    if (input.contactName !== undefined) doc.contactName = input.contactName
    if (input.contactPhone !== undefined) doc.contactPhone = input.contactPhone
    if (input.contractValue !== undefined) doc.contractValue = input.contractValue

    try {
      const result = await db.collection(COLLECTIONS.CLIENTS).insertOne(doc)
      const client = toClient({ ...doc, _id: result.insertedId })

      // Seed the activity trail so the client's detail tab is never empty.
      await db.collection(COLLECTIONS.CLIENT_ACTIVITY).insertOne({
        clientId: result.insertedId,
        description: `Client "${client.name}" created`,
        actor: actorName,
        kind: 'created',
        timestamp: now,
      })

      await createActivity({
        userId: actorId,
        description: `Client "${client.name}" was created.`,
        entityType: 'client',
        entityId: client.id,
      })

      logger.info({ actorId, clientCode, name: client.name }, 'client created')
      return client
    } catch (err) {
      // Another writer took the same sequence value — recompute and retry.
      if (isDuplicateKeyError(err)) {
        lastError = err
        continue
      }
      throw err
    }
  }

  const err: any = new Error('Could not allocate a unique client code; please retry')
  err.code = 'INTERNAL'
  err.cause = lastError
  throw err
}

/** GET /clients/:id — { client, projects, contacts, activity } (§7.6). */
export async function getClientDetail(id: string): Promise<{
  client: Client
  projects: Project[]
  contacts: ClientContact[]
  activity: ClientActivityEntry[]
} | null> {
  const db = await getDb()
  if (!ObjectId.isValid(id)) {
    return null
  }
  const clientOid = new ObjectId(id)

  const doc = await db.collection(COLLECTIONS.CLIENTS).findOne({ _id: clientOid })
  if (!doc) {
    return null
  }

  const [projectDocs, contactDocs, activityDocs] = await Promise.all([
    db.collection(COLLECTIONS.PROJECTS).find({ clientId: clientOid }).sort({ createdAt: -1 }).toArray(),
    db.collection(COLLECTIONS.CLIENT_CONTACTS).find({ clientId: clientOid }).sort({ name: 1 }).toArray(),
    db
      .collection(COLLECTIONS.CLIENT_ACTIVITY)
      .find({ clientId: clientOid })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray(),
  ])

  return {
    client: toClient(doc),
    // Lazy import avoided: projects are mapped from raw rows the same way the
    // project service maps them, keeping one shape for the frontend.
    projects: projectDocs.map((p: Record<string, any>) => ({
      id: String(p._id),
      name: p.name ?? '',
      sowNumber: p.sowNumber ?? '',
      client: p.client ?? doc.name,
      clientId: p.clientId ? String(p.clientId) : undefined,
      description: p.description ?? '',
      startDate: p.startDate ?? '',
      endDate: p.endDate ?? '',
      deadline: p.deadline ?? '',
      status: p.status ?? 'draft',
      managerId: p.managerId ? String(p.managerId) : '',
      supervisorId: p.supervisorId ? String(p.supervisorId) : '',
      teamMemberIds: (p.teamMemberIds ?? []).map((m: unknown) => String(m)),
      hourlyRate: p.hourlyRate ?? null,
      poCap: p.poCap ?? null,
      skillsRequired: p.skillsRequired,
      billRateDefault: p.billRateDefault ?? null,
      seats: p.seats,
      roleOnProject: p.roleOnProject,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : '',
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : '',
    })),
    contacts: contactDocs.map((c: Record<string, any>) => ({
      id: String(c._id),
      clientId: String(c.clientId),
      name: c.name ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
    })),
    activity: activityDocs.map((a: Record<string, any>) => ({
      id: String(a._id),
      description: a.description ?? '',
      actor: a.actor ?? '',
      timestamp: a.timestamp ? new Date(a.timestamp).toISOString() : '',
      kind: a.kind ?? 'note',
    })),
  }
}

/** POST /clients/:id/contacts — adds a `client_contacts` row (§7.6). */
export async function addClientContact(
  clientId: string,
  input: { name: string; email?: string; phone?: string },
  actorId: string,
  actorName: string,
): Promise<ClientContact> {
  const db = await getDb()
  if (!ObjectId.isValid(clientId)) {
    const err: any = new Error('Client not found')
    err.code = 'NOT_FOUND'
    throw err
  }
  const clientOid = new ObjectId(clientId)

  const client = await db.collection(COLLECTIONS.CLIENTS).findOne({ _id: clientOid })
  if (!client) {
    const err: any = new Error('Client not found')
    err.code = 'NOT_FOUND'
    throw err
  }

  const now = new Date()
  const result = await db.collection(COLLECTIONS.CLIENT_CONTACTS).insertOne({
    clientId: clientOid,
    name: input.name,
    email: input.email ?? '',
    phone: input.phone ?? '',
    createdAt: now,
    updatedAt: now,
  })

  await db.collection(COLLECTIONS.CLIENT_ACTIVITY).insertOne({
    clientId: clientOid,
    description: `Contact "${input.name}" added`,
    actor: actorName,
    kind: 'contact',
    timestamp: now,
  })

  await createActivity({
    userId: actorId,
    description: `Contact "${input.name}" added to client "${client.name}".`,
    entityType: 'client',
    entityId: clientId,
  })

  return {
    id: result.insertedId.toString(),
    clientId,
    name: input.name,
    email: input.email ?? '',
    phone: input.phone ?? '',
  }
}