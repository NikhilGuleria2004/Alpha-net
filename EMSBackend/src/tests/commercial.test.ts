import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import * as jwt from '../lib/jwt.js'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { normalizeClientName } from '../services/client.service.js'
import { toAssignment } from '../services/assignment.service.js'
import type { UserRole } from '../types/auth.js'

vi.mock('../lib/mongodb', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}))

vi.mock('../lib/jwt', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}))

vi.mock('../services/activity.service', () => ({
  createActivity: vi.fn().mockResolvedValue({ id: '' }),
}))

vi.mock('../services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: '' }),
}))

vi.mock('../lib/email', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}))

// ── mocks ────────────────────────────────────────────────────────────────────

function createMockCollection() {
  const collection: any = {
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockImplementation(async (doc: any) => ({ insertedId: doc._id ?? new ObjectId() })),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    indexes: vi.fn().mockResolvedValue([]),
    dropIndex: vi.fn().mockResolvedValue({}),
    createIndex: vi.fn().mockResolvedValue('ok'),
    findOneAndUpdate: vi.fn(),
    aggregate: vi.fn(() => createMockCursor()),
  }
  collection.find = vi.fn(() => createMockCursor())
  return collection
}

function createMockCursor(docs: any[] = []) {
  const cursor: any = {
    _docs: docs,
    sort: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    skip: vi.fn(() => cursor),
    project: vi.fn(() => cursor),
    toArray: vi.fn(async () => docs),
  }
  return cursor
}

let mockDb: any
let clientsCol: any
let projectsCol: any
let assignmentsCol: any
let usersCol: any
let clientContactsCol: any
let clientActivityCol: any
let documentsCol: any

/**
 * Every seeded `users` row, keyed by hex id. One stable `findOne` serves both
 * the auth middleware and service lookups, mirroring the real single collection.
 */
const knownUsers = new Map<string, any>()

function setupDbMocks() {
  clientsCol = createMockCollection()
  projectsCol = createMockCollection()
  assignmentsCol = createMockCollection()
  usersCol = createMockCollection()
  clientContactsCol = createMockCollection()
  clientActivityCol = createMockCollection()
  documentsCol = createMockCollection()
  knownUsers.clear()

  usersCol.findOne = vi.fn(async ({ _id }: any) => knownUsers.get(String(_id)) ?? null)

  const map: Record<string, any> = {
    [COLLECTIONS.CLIENTS]: clientsCol,
    [COLLECTIONS.PROJECTS]: projectsCol,
    [COLLECTIONS.ASSIGNMENTS]: assignmentsCol,
    [COLLECTIONS.USERS]: usersCol,
    [COLLECTIONS.CLIENT_CONTACTS]: clientContactsCol,
    [COLLECTIONS.CLIENT_ACTIVITY]: clientActivityCol,
    [COLLECTIONS.DOCUMENTS]: documentsCol,
  }

  mockDb = { collection: vi.fn((name: string) => map[name] ?? createMockCollection()) }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

let userCounter = 0
function makeId(): string {
  userCounter++
  // Always exactly 24 hex chars, with the counter in the tail so each call is
  // still unique — a longer counter would overflow and make ObjectId throw.
  return `507f1f77bcf86cd7${userCounter.toString(16).padStart(8, '0')}`
}

function mockUser(id: string, overrides: Partial<any> = {}): any {
  return {
    _id: new ObjectId(id),
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: 'hashed',
    employeeId: 'E000001',
    department: 'Engineering',
    role: 'employee',
    isSupervisor: false,
    status: 'active',
    billable: true,
    payRate: 80,
    currency: 'USD',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function setupAuth(role: UserRole, overrides: Partial<any> = {}) {
  const userId = makeId()
  vi.mocked(jwt.verifyAccessToken).mockResolvedValue({
    userId,
    role,
    billable: false,
    exp: 9999999999,
  } as any)
  // Register in the shared fixture map so the same `users.findOne` serves both
  // the auth middleware and service-level resource lookups, as the real
  // single `users` collection does.
  knownUsers.set(userId, mockUser(userId, { role, name: `${role} Actor`, ...overrides }))
  return userId
}

/**
 * Register an extra employee row (an assignment target) without disturbing the
 * auth user's own lookup.
 */
function addUser(overrides: Partial<any> = {}): string {
  const id = makeId()
  knownUsers.set(id, mockUser(id, { name: 'Esha Employee', payRate: 85, billable: true, ...overrides }))
  return id
}

const app = createApp()

/** Wrap the supertest agent so every request carries the Bearer header. */
function authed(target: any): any {
  const header = { Authorization: 'Bearer valid-token' }
  return {
    get: (url: string) => target.get(url).set(header),
    post: (url: string) => target.post(url).set(header),
    patch: (url: string) => target.patch(url).set(header),
    delete: (url: string) => target.delete(url).set(header),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDbMocks()
})

// ── unit: normalization + margin/status mapping ──────────────────────────────

describe('normalizeClientName', () => {
  it('lowercases, trims and collapses whitespace like the platform does', () => {
    expect(normalizeClientName('  Acme   Corp ')).toBe('acme corp')
    expect(normalizeClientName('ACME CORP')).toBe('acme corp')
  })
})

describe('toAssignment', () => {
  const base = {
    _id: new ObjectId(makeId()),
    resourceId: new ObjectId(makeId()),
    projectId: new ObjectId(makeId()),
    clientId: new ObjectId(makeId()),
    billRate: 140,
    payRate: 85,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    status: 'active',
    currency: 'USD',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('derives marginPct as (bill - pay) / bill', () => {
    expect(toAssignment({ ...base }).marginPct).toBeCloseTo((140 - 85) / 140, 10)
  })

  it('returns a null margin when billRate is zero', () => {
    expect(toAssignment({ ...base, billRate: 0, payRate: 0 }).marginPct).toBeNull()
  })

  it('reads userId from resourceId when only the platform field is present', () => {
    const doc = { ...base }
    delete (doc as any).userId
    expect(toAssignment(doc).userId).toBe(String(base.resourceId))
  })

  it('maps stored statuses onto the frontend vocabulary', () => {
    expect(toAssignment({ ...base, status: 'onHold' }).status).toBe('proposed')
    expect(toAssignment({ ...base, status: 'completed' }).status).toBe('ended')
    expect(toAssignment({ ...base, status: 'terminated' }).status).toBe('ended')
  })

  it('maps timesheetRequired onto timesheetEnabled', () => {
    expect(toAssignment({ ...base, timesheetRequired: false }).timesheetEnabled).toBe(false)
    expect(toAssignment({ ...base, timesheetRequired: true }).timesheetEnabled).toBe(true)
  })

  it('defaults ftePercent to 100', () => {
    expect(toAssignment({ ...base }).ftePercent).toBe(100)
  })
})

// ── clients ──────────────────────────────────────────────────────────────────

describe('POST /clients', () => {
  it('generates a CL-YYYY-NNN code and writes the platform compat fields', async () => {
    setupAuth('admin')
    clientsCol.find = vi.fn(() => createMockCursor([]))

    const res = await authed(request(app)).post('/api/v1/clients').send({ name: 'Acme Corp' })

    expect(res.status).toBe(201)
    expect(res.body.client).toMatchObject({
      name: 'Acme Corp',
      normalizedName: 'acme corp',
      syncStatus: 'synced',
      status: 'active',
    })
    expect(res.body.client.clientCode).toMatch(/^CL-\d{4}-001$/)

    const inserted = clientsCol.insertOne.mock.calls[0][0]
    // The platform's toClient reads exactly these five fields.
    expect(inserted).toHaveProperty('name')
    expect(inserted).toHaveProperty('normalizedName')
    expect(inserted).toHaveProperty('clientCode')
    expect(inserted.status).toBe('active')
  })

  it('seeds a client_activity row so the detail tab is never empty', async () => {
    setupAuth('admin')
    clientsCol.find = vi.fn(() => createMockCursor([]))

    await authed(request(app)).post('/api/v1/clients').send({ name: 'Globex' })

    expect(clientActivityCol.insertOne).toHaveBeenCalledTimes(1)
    expect(clientActivityCol.insertOne.mock.calls[0][0]).toMatchObject({ kind: 'created' })
  })

  it('continues an existing sequence', async () => {
    setupAuth('admin')
    const year = new Date().getFullYear()
    clientsCol.find = vi.fn(() => createMockCursor([{ clientCode: `CL-${year}-007` }]))

    const res = await authed(request(app)).post('/api/v1/clients').send({ name: 'Initech' })

    expect(res.body.client.clientCode).toBe(`CL-${year}-008`)
  })

  it('retries on a duplicate-key race and returns the next code', async () => {
    setupAuth('admin')
    const year = new Date().getFullYear()
    clientsCol.find = vi.fn(() => createMockCursor([{ clientCode: `CL-${year}-001` }]))
    clientsCol.insertOne
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error('E11000'), { code: 11000 })
      })
      .mockImplementationOnce(async () => ({ insertedId: new ObjectId() }))

    const res = await authed(request(app)).post('/api/v1/clients').send({ name: 'Race Corp' })

    expect(res.status).toBe(201)
    expect(clientsCol.insertOne).toHaveBeenCalledTimes(2)
  })

  it('409s a duplicate normalized name', async () => {
    setupAuth('admin')
    clientsCol.findOne.mockResolvedValue({ _id: new ObjectId(), name: 'Acme Corp' })

    const res = await authed(request(app)).post('/api/v1/clients').send({ name: 'acme corp' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  it('403s an hr user (no manageClients capability)', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).post('/api/v1/clients').send({ name: 'Nope' })
    expect(res.status).toBe(403)
  })

  it('allows a manager', async () => {
    setupAuth('manager')
    clientsCol.find = vi.fn(() => createMockCursor([]))
    const res = await authed(request(app)).post('/api/v1/clients').send({ name: 'Manager Corp' })
    expect(res.status).toBe(201)
  })

  it('400s a missing name', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).post('/api/v1/clients').send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /clients', () => {
  it('returns { clients, total } in the frontend shape', async () => {
    setupAuth('admin')
    clientsCol.find = vi.fn(() =>
      createMockCursor([
        {
          _id: new ObjectId(makeId()),
          clientCode: 'CL-2026-001',
          name: 'Acme Corp',
          normalizedName: 'acme corp',
          createdAt: new Date('2026-02-01T09:00:00Z'),
          updatedAt: new Date('2026-02-01T09:00:00Z'),
        },
      ]),
    )

    const res = await authed(request(app)).get('/api/v1/clients')

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.clients[0]).toMatchObject({
      clientCode: 'CL-2026-001',
      name: 'Acme Corp',
      normalizedName: 'acme corp',
      syncStatus: 'synced',
    })
    expect(res.body.clients[0].createdAt).toBe('2026-02-01T09:00:00.000Z')
  })
})

describe('GET /clients/:id', () => {
  it('returns client + projects + contacts + activity', async () => {
    setupAuth('admin')
    const clientId = makeId()
    clientsCol.findOne.mockResolvedValue({
      _id: new ObjectId(clientId),
      clientCode: 'CL-2026-001',
      name: 'Acme Corp',
      normalizedName: 'acme corp',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    projectsCol.find = vi.fn(() =>
      createMockCursor([
        {
          _id: new ObjectId(makeId()),
          name: 'Acme Portal',
          sowNumber: 'SOW-2026-014',
          client: 'Acme Corp',
          clientId: new ObjectId(clientId),
          startDate: '2026-07-01',
          endDate: '2026-12-31',
          deadline: '2026-12-15',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    )
    clientContactsCol.find = vi.fn(() =>
      createMockCursor([
        { _id: new ObjectId(makeId()), clientId: new ObjectId(clientId), name: 'A P', email: 'ap@acme.example', phone: '555' },
      ]),
    )
    clientActivityCol.find = vi.fn(() =>
      createMockCursor([
        {
          _id: new ObjectId(makeId()),
          clientId: new ObjectId(clientId),
          description: 'Client "Acme Corp" created',
          actor: 'Hina Rao',
          kind: 'created',
          timestamp: new Date('2026-02-01T09:00:00Z'),
        },
      ]),
    )

    const res = await authed(request(app)).get(`/api/v1/clients/${clientId}`)

    expect(res.status).toBe(200)
    expect(res.body.client.clientCode).toBe('CL-2026-001')
    expect(res.body.projects).toHaveLength(1)
    expect(res.body.contacts[0]).toMatchObject({ name: 'A P', email: 'ap@acme.example', phone: '555' })
    expect(res.body.activity[0]).toMatchObject({ description: 'Client "Acme Corp" created', kind: 'created' })
    expect(res.body.activity[0].timestamp).toBe('2026-02-01T09:00:00.000Z')
  })

  it('404s an unknown client', async () => {
    setupAuth('admin')
    clientsCol.findOne.mockResolvedValue(null)
    const res = await authed(request(app)).get(`/api/v1/clients/${makeId()}`)
    expect(res.status).toBe(404)
  })

  it('404s a malformed id without throwing', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).get('/api/v1/clients/not-an-id')
    expect(res.status).toBe(404)
  })
})

describe('POST /clients/:id/contacts', () => {
  it('adds a client_contacts row and an activity entry', async () => {
    setupAuth('admin')
    const clientId = makeId()
    clientsCol.findOne.mockResolvedValue({ _id: new ObjectId(clientId), name: 'Acme Corp' })

    const res = await authed(request(app))
      .post(`/api/v1/clients/${clientId}/contacts`)
      .send({ name: 'A P', email: 'ap@acme.example', phone: '555' })

    expect(res.status).toBe(201)
    expect(res.body.contact).toMatchObject({ name: 'A P', email: 'ap@acme.example', phone: '555' })
    expect(clientContactsCol.insertOne.mock.calls[0][0].clientId).toBeInstanceOf(ObjectId)
    expect(clientActivityCol.insertOne.mock.calls[0][0].kind).toBe('contact')
  })

  it('404s a contact on an unknown client', async () => {
    setupAuth('admin')
    clientsCol.findOne.mockResolvedValue(null)
    const res = await authed(request(app)).post(`/api/v1/clients/${makeId()}/contacts`).send({ name: 'X' })
    expect(res.status).toBe(404)
  })
})

// ── projects ─────────────────────────────────────────────────────────────────

describe('POST /projects', () => {
  const clientId = () => {
    const id = makeId()
    clientsCol.findOne.mockResolvedValue({ _id: new ObjectId(id), name: 'Acme Corp' })
    return id
  }

  it('mirrors the client name into the legacy `client` string and hourlyRate', async () => {
    setupAuth('admin')
    const id = clientId()

    const res = await authed(request(app))
      .post('/api/v1/projects')
      .send({
        name: 'Acme Portal Revamp',
        clientId: id,
        sowNumber: 'SOW-2026-014',
        startDate: '2026-07-01',
        endDate: '2026-12-31',
        billRateDefault: 140,
        poCap: 50000,
      })

    expect(res.status).toBe(201)
    expect(res.body.project).toMatchObject({ name: 'Acme Portal Revamp', client: 'Acme Corp', clientId: id, status: 'draft' })
    expect(res.body.project.hourlyRate).toBe(140)
    expect(res.body.project.poCap).toBe(50000)
    expect(res.body.project.teamMemberIds).toEqual([])

    const inserted = projectsCol.insertOne.mock.calls[0][0]
    expect(inserted.client).toBe('Acme Corp')
    expect(inserted.hourlyRate).toBe(140)
    expect(inserted.clientId).toBeInstanceOf(ObjectId)
    expect(inserted.managerId).toBeInstanceOf(ObjectId)
  })

  it('defaults deadline to endDate', async () => {
    setupAuth('admin')
    const id = clientId()
    const res = await authed(request(app))
      .post('/api/v1/projects')
      .send({ name: 'P', clientId: id, sowNumber: 'SOW-1', startDate: '2026-01-01', endDate: '2026-06-30' })

    expect(res.body.project.deadline).toBe('2026-06-30')
  })

  it('409s a duplicate sowNumber', async () => {
    setupAuth('admin')
    clientId()
    projectsCol.findOne.mockResolvedValue({ _id: new ObjectId(), sowNumber: 'SOW-2026-014' })

    const res = await authed(request(app))
      .post('/api/v1/projects')
      .send({ name: 'Dup', clientId: makeId(), sowNumber: 'SOW-2026-014', startDate: '2026-01-01', endDate: '2026-02-01' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  it('maps a raw duplicate-key error to 409 as well', async () => {
    setupAuth('admin')
    clientId()
    projectsCol.findOne.mockResolvedValue(null)
    projectsCol.insertOne.mockImplementation(async () => {
      throw Object.assign(new Error('E11000'), { code: 11000 })
    })

    const res = await authed(request(app))
      .post('/api/v1/projects')
      .send({ name: 'Race', clientId: makeId(), sowNumber: 'SOW-R', startDate: '2026-01-01', endDate: '2026-02-01' })

    expect(res.status).toBe(409)
  })

  it('404s an unknown client', async () => {
    setupAuth('admin')
    clientsCol.findOne.mockResolvedValue(null)
    const res = await authed(request(app))
      .post('/api/v1/projects')
      .send({ name: 'P', clientId: makeId(), sowNumber: 'SOW-2', startDate: '2026-01-01', endDate: '2026-02-01' })

    expect(res.status).toBe(404)
  })

  it('400s when endDate precedes startDate', async () => {
    setupAuth('admin')
    const id = clientId()
    const res = await authed(request(app))
      .post('/api/v1/projects')
      .send({ name: 'P', clientId: id, sowNumber: 'SOW-3', startDate: '2026-06-30', endDate: '2026-01-01' })

    expect(res.status).toBe(400)
  })

  it('403s an employee', async () => {
    setupAuth('employee')
    const res = await authed(request(app))
      .post('/api/v1/projects')
      .send({ name: 'P', clientId: makeId(), sowNumber: 'SOW-4', startDate: '2026-01-01', endDate: '2026-02-01' })
    expect(res.status).toBe(403)
  })
})

describe('GET /projects', () => {
  it('returns { projects, total }', async () => {
    setupAuth('admin')
    projectsCol.find = vi.fn(() =>
      createMockCursor([
        {
          _id: new ObjectId(makeId()),
          name: 'Acme Portal',
          sowNumber: 'SOW-2026-014',
          client: 'Acme Corp',
          clientId: new ObjectId(makeId()),
          startDate: '2026-07-01',
          endDate: '2026-12-31',
          deadline: '2026-12-15',
          status: 'active',
          teamMemberIds: [new ObjectId(makeId())],
          hourlyRate: 140,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    )

    const res = await authed(request(app)).get('/api/v1/projects')

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.projects[0].teamMemberIds).toHaveLength(1)
    expect(res.body.projects[0].teamMemberIds[0]).toMatch(/^[0-9a-f]{24}$/)
  })

  it('filters by clientId', async () => {
    setupAuth('admin')
    const id = makeId()
    projectsCol.find = vi.fn(() => createMockCursor([]))
    await authed(request(app)).get(`/api/v1/projects?clientId=${id}`)
    expect(String(projectsCol.find.mock.calls[0][0].clientId)).toBe(id)
  })
})

describe('GET /projects/:id', () => {
  it('returns project + assignments + resolved team + documents', async () => {
    setupAuth('admin')
    const projectId = makeId()
    const memberId = makeId()
    projectsCol.findOne.mockResolvedValue({
      _id: new ObjectId(projectId),
      name: 'Acme Portal',
      sowNumber: 'SOW-2026-014',
      client: 'Acme Corp',
      clientId: new ObjectId(makeId()),
      startDate: '2026-07-01',
      endDate: '2026-12-31',
      deadline: '2026-12-15',
      status: 'active',
      teamMemberIds: [new ObjectId(memberId)],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    assignmentsCol.find = vi.fn(() =>
      createMockCursor([
        {
          _id: new ObjectId(makeId()),
          resourceId: new ObjectId(memberId),
          userId: new ObjectId(memberId),
          projectId: new ObjectId(projectId),
          clientId: new ObjectId(makeId()),
          billRate: 140,
          payRate: 85,
          status: 'active',
          roleOnProject: 'Frontend Engineer',
          startDate: '2026-09-01',
          endDate: '2027-12-31',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    )
    usersCol.find = vi.fn(() => createMockCursor([{ _id: new ObjectId(memberId), name: 'Esha Employee' }]))
    documentsCol.find = vi.fn(() =>
      createMockCursor([
        {
          _id: new ObjectId(makeId()),
          name: 'SOW.pdf',
          kind: 'contract',
          createdAt: new Date('2026-06-20T09:00:00Z'),
        },
      ]),
    )

    const res = await authed(request(app)).get(`/api/v1/projects/${projectId}`)

    expect(res.status).toBe(200)
    expect(res.body.assignments).toHaveLength(1)
    expect(res.body.team).toHaveLength(1)
    expect(res.body.team[0]).toMatchObject({ userId: memberId, name: 'Esha Employee', role: 'Frontend Engineer' })
    expect(res.body.documents[0]).toMatchObject({ name: 'SOW.pdf', kind: 'contract' })
    expect(res.body.documents[0].uploadedAt).toBe('2026-06-20T09:00:00.000Z')
  })

  it('404s an unknown project', async () => {
    setupAuth('admin')
    projectsCol.findOne.mockResolvedValue(null)
    const res = await authed(request(app)).get(`/api/v1/projects/${makeId()}`)
    expect(res.status).toBe(404)
  })
})

// ── assignments ──────────────────────────────────────────────────────────────

describe('POST /assignments', () => {
  function setupHappyPath() {
    const userId = addUser()
    const projectId = makeId()
    const clientId = makeId()
    projectsCol.findOne.mockResolvedValue({
      _id: new ObjectId(projectId),
      name: 'Acme Portal',
      sowNumber: 'SOW-2026-014',
      clientId: new ObjectId(clientId),
      client: 'Acme Corp',
    })
    assignmentsCol.find.mockImplementation(() => createMockCursor([]))
    return { userId, projectId, clientId }
  }

  it('writes both resourceId and userId plus the platform-required fields', async () => {
    setupAuth('admin')
    const { userId, projectId, clientId } = setupHappyPath()

    const res = await authed(request(app))
      .post('/api/v1/assignments')
      .send({
        userId,
        projectId,
        billRate: 140,
        payRate: 85,
        currency: 'USD',
        ftePercent: 100,
        roleOnProject: 'Frontend Engineer',
        startDate: '2026-09-01',
        endDate: '2027-12-31',
      })

    expect(res.status).toBe(201)
    expect(res.body.assignment).toMatchObject({
      userId,
      projectId,
      clientId,
      status: 'active',
      currency: 'USD',
      ftePercent: 100,
      roleOnProject: 'Frontend Engineer',
      timesheetEnabled: true,
    })
    expect(res.body.assignment.marginPct).toBeCloseTo((140 - 85) / 140, 10)

    const inserted = assignmentsCol.insertOne.mock.calls[0][0]
    // Platform compatibility set.
    expect(inserted.resourceId).toBeInstanceOf(ObjectId)
    expect(String(inserted.resourceId)).toBe(userId)
    expect(inserted.userId).toBeInstanceOf(ObjectId)
    expect(String(inserted.userId)).toBe(userId)
    expect(inserted.billingType).toBe('hourly')
    expect(inserted.timesheetRequired).toBe(true)
    expect(inserted.approvalRequired).toBe(true)
    expect(inserted.status).toBe('active')
    expect(inserted.poSow).toBe('SOW-2026-014')
  })

  it('dual-writes the project roster with $addToSet', async () => {
    setupAuth('admin')
    const { userId, projectId } = setupHappyPath()

    await authed(request(app))
      .post('/api/v1/assignments')
      .send({ userId, projectId, billRate: 140, startDate: '2026-09-01', endDate: '2027-12-31' })

    const [filter, update] = projectsCol.updateOne.mock.calls[0]
    expect(String(filter._id)).toBe(projectId)
    expect(update.$addToSet.teamMemberIds).toBeInstanceOf(ObjectId)
    expect(String(update.$addToSet.teamMemberIds)).toBe(userId)
  })

  it('inherits payRate and currency from the employee when omitted', async () => {
    setupAuth('admin')
    const { userId, projectId } = setupHappyPath()

    const res = await authed(request(app))
      .post('/api/v1/assignments').send({ userId, projectId, billRate: 140, startDate: '2026-09-01', endDate: '2027-12-31' })

    expect(res.body.assignment.payRate).toBe(85)
    expect(res.body.assignment.currency).toBe('USD')
  })

  it('409s an overlapping live assignment', async () => {
    setupAuth('admin')
    const { userId, projectId } = setupHappyPath()
    assignmentsCol.find.mockImplementation((query: any) =>
      createMockCursor(
        query?.$and
          ? [{ _id: new ObjectId(), status: 'active', startDate: '2026-08-01', endDate: '2026-10-31' }]
          : [],
      ),
    )

    const res = await authed(request(app))
      .post('/api/v1/assignments')
      .send({ userId, projectId, billRate: 140, startDate: '2026-09-01', endDate: '2026-12-31' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ASSIGNMENT_OVERLAP')
    expect(assignmentsCol.insertOne).not.toHaveBeenCalled()
  })

  it('409s a second active assignment on the same project', async () => {
    setupAuth('admin')
    const { userId, projectId } = setupHappyPath()
    assignmentsCol.find.mockImplementation(() => createMockCursor([]))
    // The same-(resource, project) guard is a findOne, not a find.
    assignmentsCol.findOne.mockResolvedValue({ _id: new ObjectId(), status: 'active' })

    const res = await authed(request(app))
      .post('/api/v1/assignments')
      .send({ userId, projectId, billRate: 140, startDate: '2027-01-01', endDate: '2027-06-30' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ASSIGNMENT_OVERLAP')
  })

  it('allows a non-overlapping follow-on assignment', async () => {
    setupAuth('admin')
    const { userId, projectId } = setupHappyPath()
    assignmentsCol.find.mockImplementation((query: any) =>
      createMockCursor(
        query?.$and
          ? [{ _id: new ObjectId(), status: 'active', startDate: '2026-01-01', endDate: '2026-03-31' }]
          : [],
      ),
    )

    const res = await authed(request(app))
      .post('/api/v1/assignments')
      .send({ userId, projectId, billRate: 140, startDate: '2026-09-01', endDate: '2026-12-31' })

    expect(res.status).toBe(201)
  })

  it('404s an unknown employee', async () => {
    setupAuth('admin')
    const res = await authed(request(app))
      .post('/api/v1/assignments')
      .send({ userId: makeId(), projectId: makeId(), billRate: 100, startDate: '2026-01-01', endDate: '2026-02-01' })
    expect(res.status).toBe(404)
  })

  it('404s an unknown project', async () => {
    setupAuth('admin')
    const userId = addUser()
    projectsCol.findOne.mockResolvedValue(null)
    const res = await authed(request(app))
      .post('/api/v1/assignments')
      .send({ userId, projectId: makeId(), billRate: 100, startDate: '2026-01-01', endDate: '2026-02-01' })
    expect(res.status).toBe(404)
  })

  it('400s a zero bill rate carrying a pay rate', async () => {
    setupAuth('admin')
    const { userId, projectId } = setupHappyPath()
    const res = await authed(request(app))
      .post('/api/v1/assignments')
      .send({ userId, projectId, billRate: 0, payRate: 50, startDate: '2026-01-01', endDate: '2026-02-01' })
    expect(res.status).toBe(400)
  })

  it('403s an hr user (no manageAssignments capability)', async () => {
    setupAuth('hr')
    const res = await authed(request(app))
      .post('/api/v1/assignments')
      .send({ userId: makeId(), projectId: makeId(), billRate: 100, startDate: '2026-01-01', endDate: '2026-02-01' })
    expect(res.status).toBe(403)
  })
})

describe('GET /assignments', () => {
  it('returns all for a manager', async () => {
    setupAuth('manager')
    assignmentsCol.find = vi.fn(() => createMockCursor([]))
    const res = await authed(request(app)).get('/api/v1/assignments')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ assignments: [], total: 0 })
  })



  it('filters ended via the stored status vocabulary', async () => {
    setupAuth('admin')
    assignmentsCol.find = vi.fn(() => createMockCursor([]))
    await authed(request(app)).get('/api/v1/assignments?status=ended')
    expect(assignmentsCol.find.mock.calls[0][0].status).toEqual({ $in: ['completed', 'terminated'] })
  })

  it('post-filters ending_soon because it is derived', async () => {
    setupAuth('admin')
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const far = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    assignmentsCol.find = vi.fn(() =>
      createMockCursor([
        { _id: new ObjectId(makeId()), resourceId: new ObjectId(makeId()), projectId: new ObjectId(makeId()), status: 'active', endDate: future, createdAt: new Date(), updatedAt: new Date() },
        { _id: new ObjectId(makeId()), resourceId: new ObjectId(makeId()), projectId: new ObjectId(makeId()), status: 'active', endDate: far, createdAt: new Date(), updatedAt: new Date() },
      ]),
    )

    const res = await authed(request(app)).get('/api/v1/assignments?status=ending_soon')

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.assignments[0].status).toBe('ending_soon')
  })
})

describe('DELETE /assignments/:id', () => {
  it('terminates the assignment and audits it', async () => {
    setupAuth('admin')
    const id = makeId()
    assignmentsCol.findOne.mockResolvedValue({
      _id: new ObjectId(id),
      projectId: new ObjectId(makeId()),
      status: 'active',
    })

    const res = await authed(request(app)).delete(`/api/v1/assignments/${id}`)

    expect(res.status).toBe(204)
    expect(assignmentsCol.updateOne.mock.calls[0][1].$set.status).toBe('terminated')
  })

  it('404s an already-terminated assignment', async () => {
    setupAuth('admin')
    assignmentsCol.findOne.mockResolvedValue({ _id: new ObjectId(makeId()), status: 'terminated' })
    const res = await authed(request(app)).delete(`/api/v1/assignments/${makeId()}`)
    expect(res.status).toBe(404)
  })

  it('404s an unknown assignment', async () => {
    setupAuth('admin')
    assignmentsCol.findOne.mockResolvedValue(null)
    const res = await authed(request(app)).delete(`/api/v1/assignments/${makeId()}`)
    expect(res.status).toBe(404)
  })

  it('403s an employee', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).delete(`/api/v1/assignments/${makeId()}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /assignments/demand', () => {
  it('returns seats vs filled per active project', async () => {
    setupAuth('admin')
    const projectId = makeId()
    projectsCol.find = vi.fn(() =>
      createMockCursor([
        {
          _id: new ObjectId(projectId),
          name: 'Acme Portal',
          startDate: '2026-07-01',
          endDate: '2026-12-31',
          status: 'active',
          seats: 3,
          roleOnProject: 'Frontend Engineer',
          skillsRequired: ['React', 'TypeScript'],
        },
      ]),
    )
    assignmentsCol.countDocuments = vi.fn().mockResolvedValue(2)

    const res = await authed(request(app)).get('/api/v1/assignments/demand')

    expect(res.status).toBe(200)
    expect(res.body.demands).toHaveLength(1)
    expect(res.body.demands[0]).toMatchObject({
      id: projectId,
      projectName: 'Acme Portal',
      role: 'Frontend Engineer',
      skills: ['React', 'TypeScript'],
      seats: 3,
      filled: 2,
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    })
  })

  it('defaults seats to 1 when unset', async () => {
    setupAuth('admin')
    projectsCol.find = vi.fn(() =>
      createMockCursor([{ _id: new ObjectId(makeId()), name: 'P', startDate: '2026-01-01', endDate: '2026-02-01', status: 'draft' }]),
    )
    assignmentsCol.countDocuments = vi.fn().mockResolvedValue(0)

    const res = await authed(request(app)).get('/api/v1/assignments/demand')
    expect(res.body.demands[0].seats).toBe(1)
  })

  it('lets a manager read demand (managers do hold manageProjects)', async () => {
    setupAuth('manager')
    const res = await authed(request(app)).get('/api/v1/assignments/demand')
    expect(res.status).toBe(200)
  })

  it('403s an employee (demand is gated on manageProjects)', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).get('/api/v1/assignments/demand')
    expect(res.status).toBe(403)
  })
})

// ── full pipeline: client -> project -> assignment -> platform shape ─────────

describe('Phase 6 pipeline (shared-DB platform shape)', () => {
  it('produces rows the platform backend can read back', async () => {
    setupAuth('admin')

    // 1. client — the duplicate probe misses, so the create succeeds.
    const clientId = makeId()
    clientsCol.findOne.mockResolvedValueOnce(null)
    clientsCol.find.mockImplementation(() => createMockCursor([]))
    const created = await authed(request(app)).post('/api/v1/clients').send({ name: 'Acme Corp' })
    expect(created.status).toBe(201)

    // Subsequent project/assignment lookups resolve the client created above.
    clientsCol.findOne.mockResolvedValue({ _id: new ObjectId(clientId), name: 'Acme Corp', normalizedName: 'acme corp' })

    // 2. project — mirrors client name + hourlyRate
    const projectRes = await authed(request(app))
      .post('/api/v1/projects')
      .send({
        name: 'Acme Portal Revamp',
        clientId,
        sowNumber: 'SOW-2026-014',
        startDate: '2026-07-01',
        endDate: '2026-12-31',
        billRateDefault: 140,
      })
    expect(projectRes.status).toBe(201)

    // 3. assignment — resourceId + userId + platform flags
    const resourceId = addUser()
    projectsCol.findOne.mockResolvedValue({
      _id: new ObjectId(projectIdFrom(projectRes)),
      name: 'Acme Portal Revamp',
      sowNumber: 'SOW-2026-014',
      clientId: new ObjectId(clientId),
      client: 'Acme Corp',
    })
    assignmentsCol.find.mockImplementation(() => createMockCursor([]))

    const assignmentRes = await authed(request(app))
      .post('/api/v1/assignments')
      .send({
        userId: resourceId,
        projectId: projectIdFrom(projectRes),
        billRate: 140,
        startDate: '2026-09-01',
        endDate: '2026-12-31',
      })
    expect(assignmentRes.status).toBe(201)
    const clientRow = clientsCol.insertOne.mock.calls[0][0]
    expect(clientRow.normalizedName).toBe('acme corp')
    expect(clientRow.name).toBe('Acme Corp')

    const projectRow = projectsCol.insertOne.mock.calls[0][0]
    expect(projectRow.client).toBe('Acme Corp')
    expect(String(projectRow.clientId)).toBe(clientId)
    expect(projectRow.hourlyRate).toBe(140)
    expect(projectRow.sowNumber).toBe('SOW-2026-014')
    expect(Array.isArray(projectRow.teamMemberIds)).toBe(true)

    const assignmentRow = assignmentsCol.insertOne.mock.calls[0][0]
    expect(String(assignmentRow.resourceId)).toBe(resourceId)
    expect(String(assignmentRow.userId)).toBe(resourceId)
    expect(assignmentRow.billingType).toBe('hourly')
    expect(assignmentRow.timesheetRequired).toBe(true)
    expect(assignmentRow.approvalRequired).toBe(true)
    expect(assignmentRow.status).toBe('active')
    expect(String(assignmentRow.projectId)).toBe(projectIdFrom(projectRes))

    // Roster dual-write happened.
    expect(projectsCol.updateOne).toHaveBeenCalledTimes(1)
  })
})

function projectIdFrom(res: any): string {
  return res.body.project.id
}