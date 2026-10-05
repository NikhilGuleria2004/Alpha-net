import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import * as jwt from '../lib/jwt.js'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { createNotification } from '../services/notification.service.js'
import { DEFAULT_ORG_SETTINGS, DEFAULT_USER_SETTINGS } from '../services/settings.service.js'
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

// ── mocks ────────────────────────────────────────────────────────────────────

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

function createMockCollection() {
  const collection: any = {
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockImplementation(async (doc: any) => ({ insertedId: doc._id ?? new ObjectId() })),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    find: vi.fn(() => createMockCursor()),
  }
  return collection
}

let mockDb: any
let usersCol: any
let notificationsCol: any
let settingsCol: any
let activitiesCol: any

const knownUsers = new Map<string, any>()

function setupDbMocks() {
  usersCol = createMockCollection()
  notificationsCol = createMockCollection()
  settingsCol = createMockCollection()
  activitiesCol = createMockCollection()
  knownUsers.clear()

  usersCol.findOne = vi.fn(async ({ _id }: any) => knownUsers.get(String(_id)) ?? null)
  usersCol.find = vi.fn((query: any) => {
    const wanted = query?._id?.$in ? query._id.$in.map(String) : null
    const docs = [...knownUsers.entries()]
      .filter(([id]) => (wanted ? wanted.includes(id) : true))
      .map(([, user]) => user)
    return createMockCursor(docs)
  })

  const map: Record<string, any> = {
    [COLLECTIONS.USERS]: usersCol,
    [COLLECTIONS.NOTIFICATIONS]: notificationsCol,
    [COLLECTIONS.SETTINGS]: settingsCol,
    [COLLECTIONS.ACTIVITIES]: activitiesCol,
  }

  mockDb = { collection: vi.fn((name: string) => map[name] ?? createMockCollection()) }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

let idCounter = 0
function makeId(): string {
  idCounter++
  return `507f1f77bcf86cd7${idCounter.toString(16).padStart(8, '0')}`
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
  knownUsers.set(userId, mockUser(userId, { role, name: `${role} Actor`, ...overrides }))
  return userId
}

const app = createApp()

function authed(target: any): any {
  const header = { Authorization: 'Bearer valid-token' }
  return {
    get: (url: string) => target.get(url).set(header),
    post: (url: string) => target.post(url).set(header),
    put: (url: string) => target.put(url).set(header),
    patch: (url: string) => target.patch(url).set(header),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDbMocks()
})

// ── GET /notifications ───────────────────────────────────────────────────────

describe('GET /notifications', () => {
  function seedNotifications(docs: any[]): void {
    notificationsCol.find = vi.fn(() => createMockCursor(docs))
    notificationsCol.countDocuments = vi.fn().mockResolvedValue(docs.filter((d) => !d.read).length)
  }

  it('401s without a token', async () => {
    const res = await request(app).get('/api/v1/notifications')
    expect(res.status).toBe(401)
  })

  it('returns the frontend EmsNotification shape', async () => {
    const userId = setupAuth('employee')
    const relatedId = makeId()
    seedNotifications([
      {
        _id: new ObjectId(makeId()),
        userId: new ObjectId(userId),
        type: 'approval',
        title: 'Leave approved',
        message: 'Your request was approved',
        read: false,
        relatedId: new ObjectId(relatedId),
        createdAt: new Date('2026-09-10T10:00:00.000Z'),
      },
    ])

    const res = await authed(request(app)).get('/api/v1/notifications')
    expect(res.status).toBe(200)
    expect(res.body.unreadCount).toBe(1)
    expect(res.body.notifications).toHaveLength(1)

    const notification = res.body.notifications[0]
    expect(Object.keys(notification).sort()).toEqual(
      ['createdAt', 'id', 'message', 'read', 'relatedId', 'title', 'type', 'userId'].sort(),
    )
    expect(notification).toMatchObject({
      userId,
      type: 'approval',
      title: 'Leave approved',
      message: 'Your request was approved',
      read: false,
      relatedId,
      createdAt: '2026-09-10T10:00:00.000Z',
    })
  })

  it('never surfaces the legacy body/link columns', async () => {
    setupAuth('employee')
    seedNotifications([
      {
        _id: new ObjectId(makeId()),
        userId: new ObjectId(),
        type: 'attendance',
        title: 'Marked present',
        body: 'legacy body text',
        message: 'modern message text',
        link: '/attendance',
        read: true,
        createdAt: new Date(),
      },
    ])

    const res = await authed(request(app)).get('/api/v1/notifications')
    const notification = res.body.notifications[0]
    expect(notification.message).toBe('modern message text')
    expect(notification).not.toHaveProperty('body')
    expect(notification).not.toHaveProperty('link')
  })

  it('falls back to the legacy body when message is absent', async () => {
    setupAuth('employee')
    seedNotifications([
      {
        _id: new ObjectId(makeId()),
        type: 'user',
        title: 'Welcome',
        body: 'legacy body text',
        read: false,
        createdAt: new Date(),
      },
    ])

    const res = await authed(request(app)).get('/api/v1/notifications')
    expect(res.body.notifications[0].message).toBe('legacy body text')
  })

  it('caps the list at 50 but counts every unread', async () => {
    setupAuth('employee')
    const docs = Array.from({ length: 50 }, () => ({
      _id: new ObjectId(makeId()),
      type: 'user',
      title: 't',
      message: 'm',
      read: false,
      createdAt: new Date(),
    }))
    seedNotifications(docs)
    notificationsCol.countDocuments = vi.fn().mockResolvedValue(73)

    const res = await authed(request(app)).get('/api/v1/notifications')
    expect(res.body.notifications).toHaveLength(50)
    expect(res.body.unreadCount).toBe(73)
    expect(notificationsCol.find.mock.results[0].value.limit).toHaveBeenCalledWith(50)
  })

  it('scopes the query to the caller', async () => {
    const userId = setupAuth('employee')
    seedNotifications([])
    await authed(request(app)).get('/api/v1/notifications')
    expect(String(notificationsCol.find.mock.calls[0][0].userId)).toBe(userId)
  })
})

// ── PATCH /notifications/:id/read ────────────────────────────────────────────

describe('PATCH /notifications/:id/read', () => {
  it('204s and marks the row read', async () => {
    setupAuth('employee')
    notificationsCol.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 })
    const id = makeId()

    const res = await authed(request(app)).patch(`/api/v1/notifications/${id}/read`)
    expect(res.status).toBe(204)

    const [filter, update] = notificationsCol.updateOne.mock.calls[0]
    expect(String(filter._id)).toBe(id)
    expect(update.$set).toMatchObject({ read: true })
    expect(update.$set.readAt).toBeInstanceOf(Date)
  })

  it('is idempotent for an already-read row', async () => {
    setupAuth('employee')
    notificationsCol.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 0 })
    notificationsCol.findOne = vi.fn().mockResolvedValue({ _id: new ObjectId(makeId()) })

    const res = await authed(request(app)).patch(`/api/v1/notifications/${makeId()}/read`)
    expect(res.status).toBe(204)
  })

  it('404s an unknown notification', async () => {
    setupAuth('employee')
    notificationsCol.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 0 })
    notificationsCol.findOne = vi.fn().mockResolvedValue(null)

    const res = await authed(request(app)).patch(`/api/v1/notifications/${makeId()}/read`)
    expect(res.status).toBe(404)
  })

  it("404s another user's notification without revealing it exists", async () => {
    setupAuth('employee')
    notificationsCol.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 0 })
    notificationsCol.findOne = vi.fn().mockResolvedValue(null)

    const res = await authed(request(app)).patch(`/api/v1/notifications/${makeId()}/read`)
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
    // The filter pins both id and owner, so a foreign row can never be updated.
    expect(notificationsCol.updateOne.mock.calls[0][0].userId).toBeDefined()
  })

  it('404s a malformed id', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).patch('/api/v1/notifications/not-an-id/read')
    expect(res.status).toBe(404)
  })
})

// ── POST /notifications/mark-all-read ────────────────────────────────────────

describe('POST /notifications/mark-all-read', () => {
  it('204s and bulk-clears only the caller rows', async () => {
    const userId = setupAuth('employee')
    notificationsCol.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 4 })

    const res = await authed(request(app)).post('/api/v1/notifications/mark-all-read')
    expect(res.status).toBe(204)

    const filter = notificationsCol.updateMany.mock.calls[0][0]
    expect(String(filter.userId)).toBe(userId)
    expect(filter.read).toBe(false)
  })

  it('is not swallowed by the /:id/read route', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).post('/api/v1/notifications/mark-all-read')
    expect(res.status).toBe(204)
  })
})

describe('createNotification', () => {
  it('dual-writes body/message and relatedId/link', async () => {
    const userId = makeId()
    const relatedId = makeId()
    await createNotification({
      userId,
      type: 'approval',
      title: 'Leave approved',
      message: 'Approved by HR',
      relatedId,
    })

    const doc = notificationsCol.insertOne.mock.calls[0][0]
    expect(doc.message).toBe('Approved by HR')
    expect(doc.body).toBe('Approved by HR')
    expect(String(doc.relatedId)).toBe(relatedId)
    expect(doc.link).toBeNull()
    expect(doc.read).toBe(false)
  })

  it('never throws when the write fails', async () => {
    notificationsCol.insertOne = vi.fn().mockRejectedValue(new Error('mongo down'))
    const result = await createNotification({
      userId: makeId(),
      type: 'user',
      title: 't',
      message: 'm',
    })
    expect(result.id).toBe('')
  })
})

// ── /settings/org ────────────────────────────────────────────────────────────

describe('GET /settings/org', () => {
  it('403s a manager', async () => {
    setupAuth('manager')
    const res = await authed(request(app)).get('/api/v1/settings/org')
    expect(res.status).toBe(403)
  })

  it('403s an employee', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).get('/api/v1/settings/org')
    expect(res.status).toBe(403)
  })

  it('lets hr read it', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).get('/api/v1/settings/org')
    expect(res.status).toBe(200)
  })

  it('returns defaults on a cold DB without writing', async () => {
    setupAuth('admin')
    settingsCol.findOne = vi.fn().mockResolvedValue(null)

    const res = await authed(request(app)).get('/api/v1/settings/org')
    expect(res.status).toBe(200)
    expect(res.body.settings).toEqual(DEFAULT_ORG_SETTINGS)
    expect(settingsCol.updateOne).not.toHaveBeenCalled()
  })

  it('returns the stored row when one exists', async () => {
    setupAuth('admin')
    settingsCol.findOne = vi.fn().mockResolvedValue({
      orgKey: 'global',
      orgName: 'Acme Corp',
      showBillRateToEmployee: true,
      leavePolicy: { annualLeaveDays: 25, sickLeaveDays: 12, lockAfterApproval: false },
      approvalChain: ['manager', 'admin'],
    })

    const res = await authed(request(app)).get('/api/v1/settings/org')
    expect(res.body.settings).toMatchObject({
      orgName: 'Acme Corp',
      showBillRateToEmployee: true,
      approvalChain: ['manager', 'admin'],
    })
    expect(res.body.settings.leavePolicy.annualLeaveDays).toBe(25)
  })
})

describe('PUT /settings/org', () => {
  const validBody = {
    orgName: 'Eniac Inc.',
    showBillRateToEmployee: true,
    leavePolicy: { annualLeaveDays: 22, sickLeaveDays: 10, lockAfterApproval: true },
    approvalChain: ['manager', 'hr', 'admin'],
  }

  it('403s hr', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).put('/api/v1/settings/org').send(validBody)
    expect(res.status).toBe(403)
  })

  it('upserts on the unique orgKey', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).put('/api/v1/settings/org').send(validBody)
    expect(res.status).toBe(200)

    const [filter, update, options] = settingsCol.updateOne.mock.calls[0]
    expect(filter).toEqual({ orgKey: 'global' })
    expect(update.$set).toMatchObject({ orgName: 'Eniac Inc.', showBillRateToEmployee: true })
    expect(options).toMatchObject({ upsert: true })
  })

  it('400s an empty org name', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).put('/api/v1/settings/org').send({ ...validBody, orgName: '  ' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('400s an unknown approval-chain role', async () => {
    setupAuth('admin')
    const res = await authed(request(app))
      .put('/api/v1/settings/org')
      .send({ ...validBody, approvalChain: ['wizard'] })
    expect(res.status).toBe(400)
  })

  it('400s a non-numeric leave allowance', async () => {
    setupAuth('admin')
    const res = await authed(request(app))
      .put('/api/v1/settings/org')
      .send({ ...validBody, leavePolicy: { ...validBody.leavePolicy, annualLeaveDays: 'twenty' } })
    expect(res.status).toBe(400)
  })
})

// ── /settings/me ─────────────────────────────────────────────────────────────

describe('/settings/me', () => {
  it('returns defaults on a cold DB', async () => {
    setupAuth('employee')
    settingsCol.findOne = vi.fn().mockResolvedValue(null)
    const res = await authed(request(app)).get('/api/v1/settings/me')
    expect(res.status).toBe(200)
    expect(res.body.settings).toEqual(DEFAULT_USER_SETTINGS)
  })

  it('updates the phone only, keeping notification prefs', async () => {
    setupAuth('employee')
    settingsCol.findOne = vi.fn().mockResolvedValue(null)

    const res = await authed(request(app)).put('/api/v1/settings/me').send({ phone: '+1 555 0100' })
    expect(res.status).toBe(200)

    const update = settingsCol.updateOne.mock.calls[0][1].$set
    expect(update.phone).toBe('+1 555 0100')
    // A phone-only PUT must not wipe notification prefs.
    expect(update.notifications).toEqual(DEFAULT_USER_SETTINGS.notifications)
  })

  it('updates notification prefs', async () => {
    setupAuth('employee')
    settingsCol.findOne = vi
      .fn()
      .mockResolvedValue({ phone: '+1 555', notifications: { inApp: true, email: false } })

    const res = await authed(request(app))
      .put('/api/v1/settings/me')
      .send({ notifications: { inApp: false, email: true } })
    expect(res.status).toBe(200)
    expect(settingsCol.updateOne.mock.calls[0][1].$set.notifications).toEqual({
      inApp: false,
      email: true,
    })
  })

  it('never stores theme or density (client-localStorage only)', async () => {
    setupAuth('employee')
    settingsCol.findOne = vi.fn().mockResolvedValue(null)

    const res = await authed(request(app))
      .put('/api/v1/settings/me')
      .send({ phone: '+1 555', theme: 'dark', density: 'compact' })

    expect(res.status).toBe(200)
    const update = settingsCol.updateOne.mock.calls[0][1].$set
    expect(update).not.toHaveProperty('theme')
    expect(update).not.toHaveProperty('density')
  })

  it('lets any role manage their own settings', async () => {
    setupAuth('employee')
    settingsCol.findOne = vi.fn().mockResolvedValue(null)
    const res = await authed(request(app)).put('/api/v1/settings/me').send({ phone: 'x' })
    expect(res.status).toBe(200)
  })
})

// ── GET /audit ───────────────────────────────────────────────────────────────

describe('GET /audit', () => {
  function seedActivities(docs: any[]): void {
    activitiesCol.find = vi.fn(() => createMockCursor(docs))
    activitiesCol.countDocuments = vi.fn().mockResolvedValue(docs.length)
  }

  it('403s hr', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).get('/api/v1/audit')
    expect(res.status).toBe(403)
  })

  it('403s a manager', async () => {
    setupAuth('manager')
    const res = await authed(request(app)).get('/api/v1/audit')
    expect(res.status).toBe(403)
  })

  it('403s an employee', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).get('/api/v1/audit')
    expect(res.status).toBe(403)
  })

  it('401s without a token', async () => {
    const res = await request(app).get('/api/v1/audit')
    expect(res.status).toBe(401)
  })

  it('lets admin read it', async () => {
    setupAuth('admin')
    seedActivities([])
    const res = await authed(request(app)).get('/api/v1/audit')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ events: [], total: 0 })
  })

  it('returns the AuditEvent shape the dashboard already uses', async () => {
    setupAuth('admin')
    const actorId = makeId()
    knownUsers.set(actorId, mockUser(actorId, { name: 'Aarti Admin' }))
    seedActivities([
      {
        _id: new ObjectId(makeId()),
        userId: new ObjectId(actorId),
        description: 'Client "Acme Corp" created.',
        entityType: 'client',
        entityId: makeId(),
        severity: 'info',
        createdAt: new Date('2026-09-09T08:30:00.000Z'),
      },
    ])

    const res = await authed(request(app)).get('/api/v1/audit')
    const event = res.body.events[0]
    expect(Object.keys(event).sort()).toEqual(['actor', 'description', 'id', 'severity', 'timestamp'].sort())
    expect(event).toMatchObject({
      description: 'Client "Acme Corp" created.',
      actor: 'Aarti Admin',
      severity: 'info',
      timestamp: '2026-09-09T08:30:00.000Z',
    })
  })

  it('resolves the actor name from userId', async () => {
    setupAuth('admin')
    const actorId = makeId()
    knownUsers.set(actorId, mockUser(actorId, { name: 'Bhavesh Reviewer' }))
    seedActivities([
      { _id: new ObjectId(makeId()), userId: new ObjectId(actorId), description: 'x', createdAt: new Date() },
    ])

    const res = await authed(request(app)).get('/api/v1/audit')
    expect(res.body.events[0].actor).toBe('Bhavesh Reviewer')
  })

  it('falls back to System for a missing actor', async () => {
    setupAuth('admin')
    seedActivities([
      { _id: new ObjectId(makeId()), description: 'nightly cleanup', createdAt: new Date() },
    ])

    const res = await authed(request(app)).get('/api/v1/audit')
    expect(res.body.events[0].actor).toBe('System')
  })

  it('defaults severity to info', async () => {
    setupAuth('admin')
    seedActivities([{ _id: new ObjectId(makeId()), description: 'x', createdAt: new Date() }])
    const res = await authed(request(app)).get('/api/v1/audit')
    expect(res.body.events[0].severity).toBe('info')
  })

  it('filters by entityType', async () => {
    setupAuth('admin')
    seedActivities([])
    await authed(request(app)).get('/api/v1/audit?entityType=assignment')
    expect(activitiesCol.find.mock.calls[0][0]).toEqual({ entityType: 'assignment' })
  })

  it('filters by entityId', async () => {
    setupAuth('admin')
    seedActivities([])
    const entityId = makeId()
    await authed(request(app)).get(`/api/v1/audit?entityId=${entityId}`)
    expect(String(activitiesCol.find.mock.calls[0][0].entityId)).toBe(entityId)
  })

  it('sorts newest-first and paginates', async () => {
    setupAuth('admin')
    seedActivities([])
    const res = await authed(request(app)).get('/api/v1/audit?page=2&limit=10')

    const cursor = activitiesCol.find.mock.results[0].value
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(cursor.skip).toHaveBeenCalledWith(10)
    expect(cursor.limit).toHaveBeenCalledWith(10)
    expect(res.body).toMatchObject({ page: 2, limit: 10 })
  })

  it('returns the full match count, not the page length', async () => {
    setupAuth('admin')
    seedActivities([{ _id: new ObjectId(makeId()), description: 'x', createdAt: new Date() }])
    activitiesCol.countDocuments = vi.fn().mockResolvedValue(137)

    const res = await authed(request(app)).get('/api/v1/audit?page=1&limit=25')
    expect(res.body.total).toBe(137)
    expect(res.body.events).toHaveLength(1)
  })

  it('caps the limit at 100', async () => {
    setupAuth('admin')
    seedActivities([])
    await authed(request(app)).get('/api/v1/audit?limit=5000')
    expect(activitiesCol.find.mock.results[0].value.limit).toHaveBeenCalledWith(100)
  })

  it('400s a malformed entityId', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).get('/api/v1/audit?entityId=nope')
    expect(res.status).toBe(400)
  })

  it('never mutates or deletes the append-only feed', async () => {
    setupAuth('admin')
    seedActivities([])
    await authed(request(app)).get('/api/v1/audit')
    expect(activitiesCol.updateOne).not.toHaveBeenCalled()
    expect(activitiesCol.deleteOne).not.toHaveBeenCalled()
  })
})