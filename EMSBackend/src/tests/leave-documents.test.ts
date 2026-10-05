import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import * as jwt from '../lib/jwt.js'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { countLeaveDays } from '../services/leave.service.js'
import { createNotification } from '../services/notification.service.js'
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
    findOneAndUpdate: vi.fn(),
    insertOne: vi.fn().mockImplementation(async (doc: any) => ({ insertedId: doc._id ?? new ObjectId() })),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    countDocuments: vi.fn().mockResolvedValue(0),
  }
  collection.find = vi.fn(() => createMockCursor())
  collection.aggregate = vi.fn(() => createMockCursor())
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
let leaveRequestsCollection: any
let leaveTypesCollection: any
let usersCollection: any
let documentsCollection: any

function setupDbMocks() {
  leaveRequestsCollection = createMockCollection()
  leaveTypesCollection = createMockCollection()
  usersCollection = createMockCollection()
  documentsCollection = createMockCollection()

  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.LEAVE_REQUESTS) return leaveRequestsCollection
      if (name === COLLECTIONS.LEAVE_TYPES) return leaveTypesCollection
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.DOCUMENTS) return documentsCollection
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

let userCounter = 0
function makeUserId(): string {
  userCounter++
  return `507f1f77bcf86cd7994390${String(userCounter).padStart(2, '0')}`
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
    billable: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function setupAuth(role: UserRole, overrides: Partial<any> = {}) {
  const userId = makeUserId()
  vi.mocked(jwt.verifyAccessToken).mockResolvedValue({
    userId,
    role,
    billable: false,
    exp: 9999999999,
  } as any)
  usersCollection.findOne.mockResolvedValue(mockUser(userId, { role, name: `${role} Reviewer`, ...overrides }))
  return userId
}

function leaveRow(overrides: Partial<any> = {}): any {
  return {
    _id: new ObjectId(makeUserId()),
    userId: new ObjectId(makeUserId()),
    type: 'vacation',
    startDate: '2026-10-05',
    endDate: '2026-10-07',
    days: 3,
    status: 'pending',
    submittedAt: '2026-10-01T09:30:00.000Z',
    createdAt: new Date('2026-10-01T09:30:00Z'),
    ...overrides,
  }
}

function documentRow(overrides: Partial<any> = {}): any {
  return {
    _id: new ObjectId(makeUserId()),
    userId: new ObjectId(makeUserId()),
    kind: 'contract',
    name: 'Offer letter.pdf',
    size: 184320,
    mimeType: 'application/pdf',
    storageKey: 'documents/ems/x/offer.pdf',
    status: 'pending',
    uploadedBy: new ObjectId(makeUserId()),
    projectId: null,
    createdAt: new Date('2026-01-06T09:00:00Z'),
    ...overrides,
  }
}

const app = createApp()

/**
 * Attach the Bearer header that `authenticate` requires on every request.
 * Wraps the supertest agent so both `authed(app).get(url)` and the multi-line
 * `authed(app)\n  .post(url)\n  .send(...)` form attach the header.
 */
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

// ── countLeaveDays (pure) ────────────────────────────────────────────────────

describe('countLeaveDays', () => {
  it('counts weekdays inclusive of both endpoints', () => {
    // Mon 2026-10-05 -> Wed 2026-10-07
    expect(countLeaveDays('2026-10-05', '2026-10-07')).toBe(3)
  })

  it('counts a single weekday as 1', () => {
    expect(countLeaveDays('2026-09-28', '2026-09-28')).toBe(1)
  })

  it('counts a full Mon-Fri week as 5', () => {
    expect(countLeaveDays('2026-10-12', '2026-10-16')).toBe(5)
  })

  it('excludes weekends inside the range', () => {
    // Fri 2026-10-09 -> Mon 2026-10-12: Fri + Mon only (Sat/Sun skipped)
    expect(countLeaveDays('2026-10-09', '2026-10-12')).toBe(2)
  })

  it('returns 0 for a weekend-only range', () => {
    // Sat 2026-10-10 -> Sun 2026-10-11
    expect(countLeaveDays('2026-10-10', '2026-10-11')).toBe(0)
  })
})

// ── GET /leave/types ─────────────────────────────────────────────────────────

describe('GET /leave/types', () => {
  it('returns the six frontend contract values in canonical order', async () => {
    setupAuth('employee')
    leaveTypesCollection.find = vi.fn(() => createMockCursor([]))

    const res = await authed(request(app)).get('/api/v1/leave/types')

    expect(res.status).toBe(200)
    expect(res.body.types.map((t: any) => t.value)).toEqual([
      'vacation',
      'sick',
      'personal',
      'unpaid',
      'maternity',
      'paternity',
    ])
  })

  it('falls back to canonical labels when the collection is cold', async () => {
    setupAuth('hr')
    leaveTypesCollection.find = vi.fn(() => createMockCursor([]))

    const res = await authed(request(app)).get('/api/v1/leave/types')

    expect(res.status).toBe(200)
    expect(res.body.types.find((t: any) => t.value === 'vacation').label).toBe('Vacation')
  })

  it('prefers operator-renamed labels from the collection', async () => {
    setupAuth('hr')
    leaveTypesCollection.find = vi.fn(() =>
      createMockCursor([{ value: 'vacation', label: 'Annual Leave' }, { value: 'sick', label: 'Sick Leave' }]),
    )

    const res = await authed(request(app)).get('/api/v1/leave/types')

    expect(res.body.types.find((t: any) => t.value === 'vacation').label).toBe('Annual Leave')
    // Unseeded values still present from the canonical list.
    expect(res.body.types).toHaveLength(6)
  })

  it('401s without auth', async () => {
    vi.mocked(jwt.verifyAccessToken).mockResolvedValue(null as any)
    const res = await request(app).get('/api/v1/leave/types')
    expect(res.status).toBe(401)
  })
})

// ── GET /leave ───────────────────────────────────────────────────────────────

describe('GET /leave', () => {
  it('scopes an employee to their own requests', async () => {
    const userId = setupAuth('employee')
    leaveRequestsCollection.find = vi.fn(() => createMockCursor([]))

    await authed(request(app)).get('/api/v1/leave')

    const query = leaveRequestsCollection.find.mock.calls[0][0]
    expect(String(query.userId)).toBe(userId)
    expect(query.status).toBeUndefined()
  })

  it('returns the full list for hr without a userId filter', async () => {
    setupAuth('hr')
    leaveRequestsCollection.find = vi.fn(() => createMockCursor([]))

    await authed(request(app)).get('/api/v1/leave')

    expect(leaveRequestsCollection.find.mock.calls[0][0].userId).toBeUndefined()
  })

  it('lets hr filter by type', async () => {
    setupAuth('hr')
    leaveRequestsCollection.find = vi.fn(() => createMockCursor([]))

    const res = await authed(request(app)).get('/api/v1/leave?type=sick')

    expect(res.status).toBe(200)
    expect(leaveRequestsCollection.find.mock.calls[0][0].type).toBe('sick')
  })

  it('rejects an unknown type with 400 rather than an empty list', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).get('/api/v1/leave?type=casual')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns { requests, total } with the employee name resolved', async () => {
    const userId = setupAuth('employee')
    const row = leaveRow({ userId: new ObjectId(userId) })
    leaveRequestsCollection.find = vi.fn(() => createMockCursor([row]))
    usersCollection.find = vi.fn(() =>
      createMockCursor([{ _id: new ObjectId(userId), name: 'Esha Employee' }]),
    )

    const res = await authed(request(app)).get('/api/v1/leave')

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.requests[0]).toMatchObject({
      userId,
      employeeName: 'Esha Employee',
      type: 'vacation',
      status: 'pending',
      days: 3,
    })
    expect(res.body.requests[0].id).toBe(String(row._id))
  })

})

// ── POST /leave ──────────────────────────────────────────────────────────────

describe('POST /leave', () => {
  it('creates a pending request and computes days server-side', async () => {
    setupAuth('employee')
    leaveRequestsCollection.findOne.mockResolvedValue(null)

    const res = await authed(request(app))
      .post('/api/v1/leave')
      .send({ type: 'vacation', startDate: '2026-10-05', endDate: '2026-10-07', reason: 'Family trip' })

    expect(res.status).toBe(201)
    expect(res.body.request).toMatchObject({
      type: 'vacation',
      startDate: '2026-10-05',
      endDate: '2026-10-07',
      days: 3,
      status: 'pending',
      reason: 'Family trip',
    })

    const inserted = leaveRequestsCollection.insertOne.mock.calls[0][0]
    expect(inserted.days).toBe(3)
    expect(inserted.status).toBe('pending')
  })

  it('ignores a client-supplied days field', async () => {
    setupAuth('employee')
    leaveRequestsCollection.findOne.mockResolvedValue(null)

    const res = await authed(request(app))
      .post('/api/v1/leave')
      .send({ type: 'vacation', startDate: '2026-10-05', endDate: '2026-10-07', days: 99, status: 'approved' })

    expect(res.status).toBe(201)
    expect(res.body.request.days).toBe(3)
    expect(res.body.request.status).toBe('pending')
    expect(leaveRequestsCollection.insertOne.mock.calls[0][0].days).toBe(3)
  })

  it('400s on a weekend-only range', async () => {
    setupAuth('employee')
    leaveRequestsCollection.findOne.mockResolvedValue(null)

    const res = await authed(request(app))
      .post('/api/v1/leave')
      .send({ type: 'vacation', startDate: '2026-10-10', endDate: '2026-10-11' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_RANGE')
  })

  it('409s on an overlapping pending request', async () => {
    setupAuth('employee')
    leaveRequestsCollection.findOne.mockResolvedValue(leaveRow({ status: 'pending' }))

    const res = await authed(request(app))
      .post('/api/v1/leave')
      .send({ type: 'vacation', startDate: '2026-10-05', endDate: '2026-10-07' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LEAVE_OVERLAP')
  })

  it('400s when endDate precedes startDate', async () => {
    setupAuth('employee')
    const res = await authed(request(app))
      .post('/api/v1/leave')
      .send({ type: 'vacation', startDate: '2026-10-07', endDate: '2026-10-05' })

    expect(res.status).toBe(400)
    expect(res.body.error.details.endDate).toBeTruthy()
  })

  it('400s on an unknown leave type', async () => {
    setupAuth('employee')
    const res = await authed(request(app))
      .post('/api/v1/leave')
      .send({ type: 'casual', startDate: '2026-10-05', endDate: '2026-10-07' })

    expect(res.status).toBe(400)
  })

  it('400s on an impossible calendar date', async () => {
    setupAuth('employee')
    const res = await authed(request(app))
      .post('/api/v1/leave')
      .send({ type: 'vacation', startDate: '2026-02-31', endDate: '2026-03-02' })

    expect(res.status).toBe(400)
  })
})

// ── PATCH /leave/:id ─────────────────────────────────────────────────────────

describe('PATCH /leave/:id', () => {
  it('approves, stamps the reviewer and notifies the requester', async () => {
    const reviewerId = setupAuth('hr')
    const row = leaveRow({ status: 'pending' })
    leaveRequestsCollection.findOne.mockResolvedValue(row)
    usersCollection.findOne.mockResolvedValue(mockUser(reviewerId, { role: 'hr', name: 'Hina Rao' }))

    const res = await authed(request(app)).patch(`/api/v1/leave/${row._id}`).send({ status: 'approved' })

    expect(res.status).toBe(200)
    expect(res.body.request.status).toBe('approved')
    expect(res.body.request.reviewedBy).toBe('Hina Rao')
    expect(res.body.request.reviewedAt).toBeTruthy()

    const update = leaveRequestsCollection.updateOne.mock.calls[0][1].$set
    expect(update.status).toBe('approved')
    expect(update.reviewedBy).toBe('Hina Rao')
    // Guarded transition: filter pins status to pending.
    expect(leaveRequestsCollection.updateOne.mock.calls[0][0].status).toBe('pending')

    expect(vi.mocked(createNotification).mock.calls[0][0]).toMatchObject({
      userId: String(row.userId),
      type: 'leave',
      title: 'Leave approved',
      relatedId: String(row._id),
    })
  })

  it('stores a review note when supplied', async () => {
    const reviewerId = setupAuth('admin')
    const row = leaveRow({ status: 'pending' })
    leaveRequestsCollection.findOne.mockResolvedValue(row)
    usersCollection.findOne.mockResolvedValue(mockUser(reviewerId, { role: 'admin', name: 'Admin Rao' }))

    await authed(request(app)).patch(`/api/v1/leave/${row._id}`).send({ status: 'rejected', note: 'Coverage gap' })

    expect(leaveRequestsCollection.updateOne.mock.calls[0][1].$set.reviewNote).toBe('Coverage gap')
    expect(vi.mocked(createNotification).mock.calls[0][0].title).toBe('Leave rejected')
  })

  it('403s an employee attempting to review', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).patch(`/api/v1/leave/${makeUserId()}`).send({ status: 'approved' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('403s a manager (no leave-review capability)', async () => {
    setupAuth('manager')
    const res = await authed(request(app)).patch(`/api/v1/leave/${makeUserId()}`).send({ status: 'approved' })
    expect(res.status).toBe(403)
  })

  it('404s an unknown request', async () => {
    setupAuth('hr')
    leaveRequestsCollection.findOne.mockResolvedValue(null)

    const res = await authed(request(app)).patch(`/api/v1/leave/${makeUserId()}`).send({ status: 'approved' })

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('409s when the request was already reviewed', async () => {
    setupAuth('hr')
    leaveRequestsCollection.findOne.mockResolvedValue(leaveRow({ status: 'approved' }))

    const res = await authed(request(app)).patch(`/api/v1/leave/${makeUserId()}`).send({ status: 'approved' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ALREADY_REVIEWED')
  })

  it('400s when trying to move a request back to pending', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).patch(`/api/v1/leave/${makeUserId()}`).send({ status: 'pending' })
    expect(res.status).toBe(400)
  })
})

// ── GET /documents ───────────────────────────────────────────────────────────

describe('GET /documents', () => {
  it('scopes an employee to their own + uploaded documents', async () => {
    const userId = setupAuth('employee')
    documentsCollection.find = vi.fn(() => createMockCursor([]))

    await authed(request(app)).get('/api/v1/documents')

    const query = documentsCollection.find.mock.calls[0][0]
    expect(query.$or).toHaveLength(2)
    expect(String(query.$or[0].userId)).toBe(userId)
    expect(String(query.$or[1].uploadedBy)).toBe(userId)
  })

  it('returns the org-wide list for hr', async () => {
    setupAuth('hr')
    documentsCollection.find = vi.fn(() => createMockCursor([]))

    await authed(request(app)).get('/api/v1/documents')

    expect(documentsCollection.find.mock.calls[0][0].$or).toBeUndefined()
  })

  it('filters by kind via ?type=', async () => {
    setupAuth('hr')
    documentsCollection.find = vi.fn(() => createMockCursor([]))

    const res = await authed(request(app)).get('/api/v1/documents?type=tax_form')

    expect(res.status).toBe(200)
    expect(documentsCollection.find.mock.calls[0][0].kind).toBe('tax_form')
  })

  it('returns { documents, total } with the frontend EmsDocument shape', async () => {
    const userId = setupAuth('employee')
    const uploaderId = makeUserId()
    const row = documentRow({ userId: new ObjectId(userId), uploadedBy: new ObjectId(uploaderId) })
    documentsCollection.find = vi.fn(() => createMockCursor([row]))
    usersCollection.find = vi.fn(() =>
      createMockCursor([{ _id: new ObjectId(uploaderId), name: 'Hina Rao' }]),
    )

    const res = await authed(request(app)).get('/api/v1/documents')

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.documents[0]).toMatchObject({
      userId,
      kind: 'contract',
      name: 'Offer letter.pdf',
      size: 184320,
      mimeType: 'application/pdf',
      storageKey: 'documents/ems/x/offer.pdf',
      status: 'pending',
      uploadedBy: uploaderId,
      uploadedByName: 'Hina Rao',
    })
    expect(res.body.documents[0].createdAt).toBe('2026-01-06T09:00:00.000Z')
  })

  it('derives status=expired from a past expiryAt', async () => {
    const userId = setupAuth('hr')
    const row = documentRow({ userId: new ObjectId(userId), expiryAt: '2020-01-01', status: 'verified' })
    documentsCollection.find = vi.fn(() => createMockCursor([row]))

    const res = await authed(request(app)).get('/api/v1/documents')

    expect(res.body.documents[0].status).toBe('expired')
  })

  it('keeps a future expiryAt on the stored status', async () => {
    const userId = setupAuth('hr')
    const row = documentRow({ userId: new ObjectId(userId), expiryAt: '2999-01-01', status: 'verified' })
    documentsCollection.find = vi.fn(() => createMockCursor([row]))

    const res = await authed(request(app)).get('/api/v1/documents')

    expect(res.body.documents[0].status).toBe('verified')
    expect(res.body.documents[0].expiresAt).toBe('2999-01-01')
  })

  it('rejects an unknown kind with 400', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).get('/api/v1/documents?type=passport')
    expect(res.status).toBe(400)
  })
})

// ── POST /documents ──────────────────────────────────────────────────────────

describe('POST /documents', () => {
  const pdf = () => Buffer.from('%PDF-1.4 fake pdf body for the EMS document test')

  it('stores metadata first and returns the EmsDocument', async () => {
    const userId = setupAuth('hr')
    usersCollection.findOne.mockResolvedValue(mockUser(userId, { role: 'hr', name: 'Hina Rao' }))

    const res = await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'id_proof')
      .field('name', 'Passport.pdf')
      .attach('file', pdf(), { filename: 'passport.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(201)
    expect(res.body.document).toMatchObject({
      userId,
      kind: 'id_proof',
      name: 'Passport.pdf',
      mimeType: 'application/pdf',
      status: 'pending',
      uploadedBy: userId,
      uploadedByName: 'Hina Rao',
    })
    expect(res.body.document.storageKey).toMatch(/^documents\/ems\//)

    const inserted = documentsCollection.insertOne.mock.calls[0][0]
    // Platform-compatible: uploadedBy is an ObjectId, projectId explicitly null.
    expect(inserted.uploadedBy).toBeInstanceOf(ObjectId)
    expect(inserted.projectId).toBeNull()
    expect(inserted.size).toBe(pdf().length)
  })

  it('lets hr file a document against another employee', async () => {
    const hrId = setupAuth('hr')
    const targetId = makeUserId()
    usersCollection.findOne.mockResolvedValue(mockUser(hrId, { role: 'hr', name: 'Hina Rao' }))

    const res = await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'contract')
      .field('userId', targetId)
      .attach('file', pdf(), { filename: 'c.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(201)
    expect(res.body.document.userId).toBe(targetId)
    // Uploader is still the HR user, not the subject.
    expect(res.body.document.uploadedBy).toBe(hrId)
  })

  it('defaults name to the uploaded filename', async () => {
    const userId = setupAuth('hr')
    usersCollection.findOne.mockResolvedValue(mockUser(userId, { role: 'hr' }))

    const res = await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'other')
      .attach('file', pdf(), { filename: 'scan-2026.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(201)
    expect(res.body.document.name).toBe('scan-2026.pdf')
  })

  it('403s an employee filing a document against another employee', async () => {
    const employeeId = setupAuth('employee')
    const targetId = makeUserId()

    const res = await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'contract')
      .field('userId', targetId)
      .attach('file', pdf(), { filename: 'forged.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(documentsCollection.insertOne).not.toHaveBeenCalled()
    expect(employeeId).toBeTruthy()
  })


  it('lets an employee upload their own document', async () => {
    const employeeId = setupAuth('employee')
    usersCollection.findOne.mockResolvedValue(mockUser(employeeId, { role: 'employee', name: 'Esha Employee' }))

    const res = await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'id_proof')
      .field('userId', employeeId)
      .attach('file', pdf(), { filename: 'my-id.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(201)
    expect(res.body.document.userId).toBe(employeeId)
  })

  it('400s when no file is attached', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).post('/api/v1/documents').field('kind', 'contract')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('400s an unsupported MIME type', async () => {
    setupAuth('hr')
    const res = await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'contract')
      .attach('file', Buffer.from('MZ'), { filename: 'evil.exe', contentType: 'application/x-msdownload' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE')
  })

  it('400s an unknown kind', async () => {
    setupAuth('hr')
    const res = await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'passport')
      .attach('file', pdf(), { filename: 'p.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('400s a missing kind', async () => {
    setupAuth('hr')
    const res = await authed(request(app))
      .post('/api/v1/documents')
      .attach('file', pdf(), { filename: 'p.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(400)
  })

  it('400s an impossible expiryAt', async () => {
    setupAuth('hr')
    const res = await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'visa')
      .field('expiryAt', '2026-02-31')
      .attach('file', pdf(), { filename: 'v.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(400)
  })

  it('401s without auth', async () => {
    vi.mocked(jwt.verifyAccessToken).mockResolvedValue(null as any)
    const res = await request(app)
      .post('/api/v1/documents')
      .field('kind', 'contract')
      .attach('file', pdf(), { filename: 'c.pdf', contentType: 'application/pdf' })

    expect(res.status).toBe(401)
  })
})

// ── shared-DB safety ─────────────────────────────────────────────────────────

describe('Phase 5 shared-collection safety', () => {
  it('writes additive fields only to the platform documents collection', async () => {
    const userId = setupAuth('hr')
    usersCollection.findOne.mockResolvedValue(mockUser(userId, { role: 'hr' }))

    await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'tax_form')
      .attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'w4.pdf', contentType: 'application/pdf' })

    const inserted = documentsCollection.insertOne.mock.calls[0][0]
    // The platform's own required fields are present and null rather than absent,
    // so the platform's index expectations still hold.
    expect(inserted).toHaveProperty('projectId')
    expect(inserted).toHaveProperty('uploadedBy')
    expect(inserted).toHaveProperty('createdAt')
  })

  it('sanitizes the storage key', async () => {
    const userId = setupAuth('hr')
    usersCollection.findOne.mockResolvedValue(mockUser(userId, { role: 'hr' }))

    await authed(request(app))
      .post('/api/v1/documents')
      .field('kind', 'other')
      .field('name', '../../etc/pass wd.json')
      .attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'x.pdf', contentType: 'application/pdf' })

    const inserted = documentsCollection.insertOne.mock.calls[0][0]
    expect(inserted.storageKey).not.toContain('..')
    expect(inserted.storageKey).toMatch(/^documents\/ems\/[0-9a-f]{24}\//)
  })
})