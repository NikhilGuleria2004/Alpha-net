import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import * as jwt from '../lib/jwt.js'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
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

vi.mock('../lib/email', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}))

function createMockCollection() {
  return {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    updateOne: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
      project: vi.fn(() => ({
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        toArray: vi.fn().mockResolvedValue([]),
      })),
    })),
  }
}

type MockCollection = ReturnType<typeof createMockCollection>

let mockDb: any
let attendanceCollection: MockCollection
let usersCollection: MockCollection

function setupDbMocks() {
  attendanceCollection = createMockCollection()
  usersCollection = createMockCollection()

  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.ATTENDANCE) return attendanceCollection
      if (name === COLLECTIONS.USERS) return usersCollection
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
    passwordHash: 'hashed-password',
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

function mockTokenPayload(userId: string, role: UserRole): any {
  return {
    userId,
    role,
    billable: false,
    exp: 9999999999,
  }
}

const TODAY = '2026-10-02'

type MockCursor = {
  sort: ReturnType<typeof vi.fn>
  toArray: ReturnType<typeof vi.fn>
  project: ReturnType<typeof vi.fn>
}

/** Build a mock find() result cursor with the shape createMockCollection expects. */
function mockFindResult(docs: any[] = [], projectDocs: any[] = []): MockCursor {
  const cursor = {
    toArray: vi.fn().mockResolvedValue(docs),
    sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) })),
    project: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(projectDocs) })),
      toArray: vi.fn().mockResolvedValue(projectDocs),
    })),
  }
  cursor.sort = vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) }))
  return cursor
}

/** Helper: set up auth + user record for a given role. */
function setupAuth(role: UserRole, overrides: Partial<any> = {}) {
  const userId = makeUserId()
  vi.mocked(jwt.verifyAccessToken).mockResolvedValue(mockTokenPayload(userId, role) as any)
  usersCollection.findOne.mockResolvedValue(mockUser(userId, { role, ...overrides }))
  return userId
}

describe('POST /api/v1/attendance/mark', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('marks attendance successfully for an employee', async () => {
    const userId = setupAuth('employee')

    attendanceCollection.findOneAndUpdate.mockResolvedValue({
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      date: TODAY,
      status: 'present',
      markedAt: new Date(),
      note: undefined,
      location: undefined,
      source: 'self',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(createApp())
      .post('/api/v1/attendance/mark')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'present' })

    expect(res.status).toBe(200)
    expect(res.body.userId).toBe(userId)
    expect(res.body.status).toBe('present')
    expect(res.body.source).toBe('self')
  })

  it('returns ATTENDANCE_EXEMPT for admin', async () => {
    setupAuth('admin')

    const res = await request(createApp())
      .post('/api/v1/attendance/mark')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'present' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ATTENDANCE_EXEMPT')
  })

  it('allows manager to mark with a note and location', async () => {
    const userId = setupAuth('manager')

    attendanceCollection.findOneAndUpdate.mockResolvedValue({
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      date: TODAY,
      status: 'remote',
      markedAt: new Date(),
      note: 'Working from home',
      location: 'Home',
      source: 'self',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(createApp())
      .post('/api/v1/attendance/mark')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'remote', note: 'Working from home', location: 'Home' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('remote')
    expect(res.body.note).toBe('Working from home')
    expect(res.body.location).toBe('Home')
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(createApp())
      .post('/api/v1/attendance/mark')
      .send({ status: 'present' })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns VALIDATION_ERROR for invalid status', async () => {
    setupAuth('employee')

    const res = await request(createApp())
      .post('/api/v1/attendance/mark')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'invalid_status' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('overwrites existing mark (upsert, no duplicate)', async () => {
    const userId = setupAuth('employee')

    let callCount = 0
    attendanceCollection.findOneAndUpdate.mockImplementation(async () => {
      callCount++
      return {
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        date: TODAY,
        status: callCount === 1 ? 'present' : 'remote',
        markedAt: new Date(),
        source: 'self',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    const res1 = await request(createApp())
      .post('/api/v1/attendance/mark')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'present' })

    const res2 = await request(createApp())
      .post('/api/v1/attendance/mark')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'remote' })

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(res2.body.status).toBe('remote')
    expect(attendanceCollection.findOneAndUpdate).toHaveBeenCalledTimes(2)
  })
})

describe('GET /api/v1/attendance/mine', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('returns summary when marked', async () => {
    const userId = setupAuth('employee')

    attendanceCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      date: TODAY,
      status: 'present',
      markedAt: new Date('2026-10-02T08:00:00.000Z'),
      source: 'self',
    })
    attendanceCollection.find.mockReturnValue(mockFindResult() as any)

    const res = await request(createApp())
      .get(`/api/v1/attendance/mine?date=${TODAY}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.userId).toBe(userId)
    expect(res.body.date).toBe(TODAY)
    expect(res.body.marked).toBe(true)
    expect(res.body.status).toBe('present')
  })

  it('returns empty summary when not marked', async () => {
    setupAuth('employee')

    attendanceCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp())
      .get(`/api/v1/attendance/mine?date=${TODAY}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.marked).toBe(false)
    expect(res.body.streakDays).toBe(0)
  })

  it('returns range records when start/end provided', async () => {
    const userId = setupAuth('employee')

    attendanceCollection.find.mockReturnValue(mockFindResult([
      {
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        date: '2026-09-26',
        status: 'present',
        markedAt: new Date('2026-09-26T08:00:00.000Z'),
        source: 'self',
      },
      {
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        date: '2026-10-02',
        status: 'remote',
        markedAt: new Date('2026-10-02T08:00:00.000Z'),
        source: 'self',
      },
    ]) as any)

    const res = await request(createApp())
      .get('/api/v1/attendance/mine?start=2026-09-26&end=2026-10-02')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.records).toHaveLength(2)
    expect(res.body.records[0].status).toBe('present')
    expect(res.body.records[1].status).toBe('remote')
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(createApp()).get('/api/v1/attendance/mine')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})

describe('DELETE /api/v1/attendance/mine', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('retracts a mark successfully', async () => {
    setupAuth('employee')

    attendanceCollection.deleteOne.mockResolvedValue({ deletedCount: 1 } as any)

    const res = await request(createApp())
      .delete(`/api/v1/attendance/mine?date=${TODAY}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(204)
  })

  it('returns ATTENDANCE_EXEMPT for admin', async () => {
    setupAuth('admin')

    const res = await request(createApp())
      .delete(`/api/v1/attendance/mine?date=${TODAY}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ATTENDANCE_EXEMPT')
  })

  it('is idempotent when no record exists', async () => {
    setupAuth('employee')

    attendanceCollection.deleteOne.mockResolvedValue({ deletedCount: 0 } as any)

    const res = await request(createApp())
      .delete(`/api/v1/attendance/mine?date=${TODAY}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(204)
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(createApp()).delete('/api/v1/attendance/mine')

    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/attendance/team', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('returns team records + KPIs for admin', async () => {
    setupAuth('admin')

    // getTeamMemberIds queries users collection for all non-admin users
    usersCollection.find.mockReturnValue(mockFindResult() as any)

    // No attendance records → all not_marked
    attendanceCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp())
      .get(`/api/v1/attendance/team?date=${TODAY}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('records')
    expect(res.body).toHaveProperty('kpis')
    expect(res.body.kpis).toHaveProperty('on_site')
    expect(res.body.kpis).toHaveProperty('remote')
    expect(res.body.kpis).toHaveProperty('late')
    expect(res.body.kpis).toHaveProperty('on_leave')
    expect(res.body.kpis).toHaveProperty('not_marked')
  })

  it('returns team records + KPIs for manager (scoped to reports)', async () => {
    setupAuth('manager')

    const emp1Id = makeUserId()
    const emp2Id = makeUserId()

    // getTeamMemberIds queries users collection for manager's direct reports
    usersCollection.find.mockReturnValue(
      mockFindResult([], [{ _id: new ObjectId(emp1Id) }, { _id: new ObjectId(emp2Id) }]) as any,
    )

    // One present, one not marked
    attendanceCollection.findOne.mockImplementation(async (_filter: any) => {
      const userId = _filter.userId
      if (userId && String(userId) === emp1Id) {
        return {
          _id: new ObjectId(),
          userId: new ObjectId(emp1Id),
          date: TODAY,
          status: 'present',
          markedAt: new Date(),
          source: 'self',
        }
      }
      return null
    })

    const res = await request(createApp())
      .get(`/api/v1/attendance/team?date=${TODAY}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.records).toHaveLength(2)
    expect(res.body.kpis.on_site).toBe(1)
    expect(res.body.kpis.not_marked).toBe(1)
  })

  it('returns 403 for employee without viewTeamAttendance capability', async () => {
    setupAuth('employee')

    const res = await request(createApp())
      .get('/api/v1/attendance/team')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('returns 401 when not authenticated', async () => {
    const res = await request(createApp()).get('/api/v1/attendance/team')

    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/attendance/team/historic', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('returns per-user history for admin', async () => {
    setupAuth('admin')

    // No team members → empty byUser
    usersCollection.find.mockReturnValue(mockFindResult() as any)

    // No attendance records → empty byUser
    attendanceCollection.find.mockReturnValue(mockFindResult() as any)

    const res = await request(createApp())
      .get('/api/v1/attendance/team/historic?range=7&anchor=2026-10-02')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('byUser')
  })

  it('returns 403 for employee without viewTeamAttendance capability', async () => {
    setupAuth('employee')

    const res = await request(createApp())
      .get('/api/v1/attendance/team/historic')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })
})
