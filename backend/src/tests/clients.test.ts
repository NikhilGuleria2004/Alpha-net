// Flow Integration Phase 1 tests (checklist Phase 1). Mocked getDb — no live Mongo.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js', () => ({ getDb: vi.fn() }))
vi.mock('../services/activity.service.js', () => ({ createActivity: vi.fn() }))
vi.mock('../services/notification.service.js', () => ({ createNotification: vi.fn() }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))

import { getDb } from '../lib/mongodb.js'
import { findOrCreateClient, normalizeClientName } from '../services/client.service.js'
import { createClientSchema } from '../schemas/client.schema.js'
import { createProjectSchema } from '../schemas/project.schema.js'

function mockDbFor(collections: Record<string, any>) {
  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => collections[name]),
  } as unknown as Awaited<ReturnType<typeof getDb>>)
}

function clientsCollection(seed: any[] = []) {
  const items = [...seed]
  return {
    items,
    find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([...items])) })), toArray: vi.fn(() => Promise.resolve([...items])) })),
    findOne: vi.fn((q: any) => {
      if (q._id) return Promise.resolve(items.find((i) => i._id.toString() === q._id.toString()) ?? null)
      if (q.normalizedName) return Promise.resolve(items.find((i) => i.normalizedName === q.normalizedName) ?? null)
      return Promise.resolve(null)
    }),
    insertOne: vi.fn((doc: any) => {
      const inserted = { _id: new ObjectId(), ...doc }
      items.push(inserted)
      return Promise.resolve({ insertedId: inserted._id })
    }),
    findOneAndUpdate: vi.fn(({ _id }: any, update: any) => {
      const idx = items.findIndex((i) => i._id.toString() === _id.toString())
      if (idx === -1) return Promise.resolve(null)
      items[idx] = { ...items[idx], ...update.$set }
      return Promise.resolve(items[idx])
    }),
  }
}

describe('Phase 1 — client normalization + dedupe', () => {
  it('normalizes Sony/sony/extra spaces to one key', () => {
    expect(normalizeClientName('Sony')).toBe('sony')
    expect(normalizeClientName('  SONY  ')).toBe('sony')
    expect(normalizeClientName('Sony   Corp')).toBe('sony corp')
  })
  it('findOrCreateClient returns existing on case-insensitive match (no dupe)', async () => {
    const existing = { _id: new ObjectId(), name: 'Sony', normalizedName: 'sony', createdAt: new Date(), updatedAt: new Date() }
    const clients = clientsCollection([existing])
    mockDbFor({ clients })
    const result = await findOrCreateClient({ name: '  SONY ' })
    expect(result.id).toBe(existing._id.toString())
    expect(clients.insertOne).not.toHaveBeenCalled()
  })
  it('findOrCreateClient creates when absent', async () => {
    const clients = clientsCollection([])
    mockDbFor({ clients })
    const result = await findOrCreateClient({ name: 'Acme' })
    expect(result.name).toBe('Acme')
    expect(clients.insertOne).toHaveBeenCalledTimes(1)
  })
  it('createClientSchema requires name, allows minimal body', () => {
    expect(() => createClientSchema.parse({ name: 'Sony' })).not.toThrow()
    expect(() => createClientSchema.parse({ name: '' })).toThrow()
    expect(() => createClientSchema.parse({})).toThrow()
  })
})


describe('Phase 1 — project create with/without clientId (legacy unchanged)', () => {
  beforeEach(() => vi.clearAllMocks())
  async function loadProjectService() {
    return import('../services/project.service.js')
  }
  it('legacy create (no clientId) still works and auto-resolves clientId', async () => {
    const clients = clientsCollection([])
    const projects = {
      insertOne: vi.fn((doc: any) => {
        const inserted = { _id: new ObjectId(), ...doc }
        return Promise.resolve({ insertedId: inserted._id })
      }),
    }
    mockDbFor({ clients, projects })
    const { createProject } = await loadProjectService()
    const project = await createProject({
      name: 'P', sowNumber: 'SOW-1', client: 'Sony', description: 'd',
      startDate: '2026-01-01', endDate: '2026-12-31', deadline: '2026-12-31',
      status: 'draft', managerId: new ObjectId().toString(),
      supervisorId: new ObjectId().toString(),
      teamMemberIds: [new ObjectId().toString()], hourlyRate: null,
    })
    expect(project.client).toBe('Sony')
    expect(project.clientId).toBeDefined()
    expect(projects.insertOne).toHaveBeenCalledTimes(1)
  })
  it('explicit clientId is honored when the client exists', async () => {
    const clientId = new ObjectId()
    const clients = clientsCollection([{ _id: clientId, name: 'Sony', normalizedName: 'sony', createdAt: new Date(), updatedAt: new Date() }])
    let saved: any = null
    const projects = {
      insertOne: vi.fn((doc: any) => {
        saved = doc
        return Promise.resolve({ insertedId: new ObjectId() })
      }),
    }
    mockDbFor({ clients, projects })
    const { createProject } = await loadProjectService()
    const project = await createProject({
      name: 'P', sowNumber: 'SOW-1', client: 'Sony', clientId: clientId.toString(),
      description: 'd', startDate: '2026-01-01', endDate: '2026-12-31',
      deadline: '2026-12-31', status: 'draft', managerId: new ObjectId().toString(),
      supervisorId: new ObjectId().toString(),
      teamMemberIds: [new ObjectId().toString()], hourlyRate: 100,
    })
    expect(project.clientId).toBe(clientId.toString())
    expect(saved.clientId.toString()).toBe(clientId.toString())
  })
  it('createProjectSchema keeps client required, clientId optional', () => {
    const base = {
      name: 'P', sowNumber: 'S', client: 'Sony', description: 'd',
      startDate: '2026-01-01', endDate: '2026-12-31', deadline: '2026-12-31',
      status: 'draft', managerId: 'm', supervisorId: 's', teamMemberIds: ['u'],
    }
    expect(() => createProjectSchema.parse(base)).not.toThrow()
    expect(() => createProjectSchema.parse({ ...base, clientId: new ObjectId().toString() })).not.toThrow()
    expect(() => createProjectSchema.parse({ ...base, client: undefined })).toThrow()
  })
})

describe('Phase 1 — backfill-clients is idempotent', () => {
  it('second run creates 0 and updates 0', async () => {
    const sonyId = new ObjectId()
    const clients = clientsCollection([{ _id: sonyId, name: 'Sony', normalizedName: 'sony', createdAt: new Date(), updatedAt: new Date() }])
    const p1 = { _id: new ObjectId(), client: 'Sony', clientId: sonyId }
    const p2 = { _id: new ObjectId(), client: 'sony', clientId: sonyId }
    const projects = {
      find: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([p1, p2])) })),
      updateOne: vi.fn(() => Promise.resolve({ modifiedCount: 0 })),
    }
    mockDbFor({ clients, projects })
    const { backfillClients } = await import('../scripts/backfill-clients.js')
    const run = await backfillClients({ dryRun: false })
    expect(run.projectsScanned).toBe(2)
    expect(run.clientsCreated).toBe(0)
    expect(run.projectsUpdated).toBe(0)
    expect(projects.updateOne).not.toHaveBeenCalled()
  })
  it('groups Sony/sony into one client and backfills missing clientId', async () => {
    const clients = clientsCollection([])
    const p1 = { _id: new ObjectId(), client: 'Sony' }
    const p2 = { _id: new ObjectId(), client: 'sony' }
    const projects = {
      find: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([p1, p2])) })),
      updateOne: vi.fn(() => Promise.resolve({ modifiedCount: 1 })),
    }
    mockDbFor({ clients, projects })
    const { backfillClients } = await import('../scripts/backfill-clients.js')
    const run = await backfillClients({ dryRun: false })
    expect(run.distinctNames).toBe(1)
    expect(run.clientsCreated).toBe(1)
    expect(run.projectsUpdated).toBe(2)
    expect(clients.insertOne).toHaveBeenCalledTimes(1)
  })
})

describe('Phase 1 — clients routes mounted (additive)', () => {
  it('GET /health still ok and /api/v1/clients requires auth (not 404)', async () => {
    const { createApp } = await import('../app.js')
    // @ts-ignore — supertest ships without types here; same pattern as auth.test.ts
    const { default: request } = await import('supertest')
    const app = createApp()
    const health = await request(app).get('/health')
    expect(health.status).toBe(200)
    const res = await request(app).get('/api/v1/clients')
    expect([401, 403]).toContain(res.status)
    expect(res.status).not.toBe(404)
  })
})
