import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import * as jwt from '../lib/jwt.js'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import type { UserRole } from '../types/auth.js'
import { invalidateUserCache } from '../middleware/auth.js'

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

function createChainableCursor(docs: any[] = []): any {
  const cursor: any = {
    toArray: vi.fn().mockResolvedValue(docs),
    sort: vi.fn(() => cursor),
    project: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    skip: vi.fn(() => cursor),
  }
  return cursor
}

function createMockCollection(docs: any[] = []): any {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    findOneAndUpdate: vi.fn().mockResolvedValue({ value: null }),
    insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    insertMany: vi.fn().mockResolvedValue({ insertedIds: [] }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn(() => createChainableCursor([])),
    find: vi.fn(() => createChainableCursor(docs)),
    distinct: vi.fn().mockResolvedValue([]),
  }
}

type MockCollection = ReturnType<typeof createMockCollection>

let mockDb: any
let mockCollections: Record<string, MockCollection>

function setupDbMocks() {
  mockCollections = {}
  const allCollectionNames = Object.values(COLLECTIONS)

  mockDb = {
    collection: vi.fn((name: string) => {
      if (!mockCollections[name]) {
        mockCollections[name] = createMockCollection()
      }
      return mockCollections[name]
    }),
  }

  vi.mocked(getDb).mockResolvedValue(mockDb as any)

  for (const name of allCollectionNames) {
    mockCollections[name] = createMockCollection()
  }
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

function setupAuth(role: UserRole, overrides: Partial<any> = {}): string {
  const userId = makeUserId()
  vi.mocked(jwt.verifyAccessToken).mockResolvedValue(mockTokenPayload(userId, role) as any)
  const usersCollection = mockCollections[COLLECTIONS.USERS]
  // Smart findOne: returns the requesting user when filtering by their _id, null otherwise
  usersCollection.findOne = vi.fn().mockImplementation((filter: any) => {
    const filterId = filter?._id
    if (filterId && String(filterId) === userId) {
      return Promise.resolve(mockUser(userId, { role, ...overrides }))
    }
    return Promise.resolve(null)
  })
  return userId
}

describe('Phase 4: Onboarding & People', () => {
  beforeEach(() => {
    setupDbMocks()
    invalidateUserCache('all')
  })

  describe('POST /onboarding (wizard step 1)', () => {
    it('creates an onboarding candidate successfully', async () => {
      setupAuth('hr')

      const onboardingCollection = mockCollections[COLLECTIONS.ONBOARDING_CANDIDATES]

      const res = await request(createApp())
        .post('/api/v1/onboarding')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Arjun Patel',
          email: 'arjun@test.com',
          employeeId: 'E000103',
          department: 'Engineering',
          role: 'employee',
          billable: true,
          payRate: 85,
          currency: 'USD',
        })

      expect(res.status).toBe(201)
      expect(res.body.candidate).toBeDefined()
      expect(res.body.candidate.name).toBe('Arjun Patel')
      expect(res.body.candidate.email).toBe('arjun@test.com')
      expect(res.body.candidate.employeeId).toBe('E000103')
      expect(res.body.candidate.stage).toBe('invited')
      expect(res.body.candidate.documentsUploaded).toBe(0)
      expect(res.body.candidate.documentsTotal).toBe(3)
      expect(onboardingCollection.insertOne).toHaveBeenCalled()
    })

    it('returns 400 when billable without payRate', async () => {
      setupAuth('hr')

      const res = await request(createApp())
        .post('/api/v1/onboarding')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          employeeId: 'E000999',
          department: 'Engineering',
          role: 'employee',
          billable: true,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BILLABLE_WITHOUT_RATE')
    })

    it('returns 403 for non-hr/admin', async () => {
      setupAuth('employee')

      const res = await request(createApp())
        .post('/api/v1/onboarding')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Test',
          email: 'test@test.com',
          employeeId: 'E000999',
          department: 'Engineering',
          role: 'employee',
        })

      expect(res.status).toBe(403)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await request(createApp())
        .post('/api/v1/onboarding')
        .send({
          name: 'Test',
          email: 'test@test.com',
          employeeId: 'E000999',
          department: 'Engineering',
          role: 'employee',
        })

      expect(res.status).toBe(401)
    })
  })

  describe('GET /onboarding/pipeline', () => {
    it('returns pipeline counts and candidates', async () => {
      setupAuth('hr')

      const onboardingCollection = mockCollections[COLLECTIONS.ONBOARDING_CANDIDATES]
      onboardingCollection.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { _id: 'invited', count: 2 },
          { _id: 'docs_pending', count: 1 },
        ]),
      })
      onboardingCollection.find.mockReturnValue(
        createChainableCursor([
          { _id: new ObjectId(), name: 'Arjun Patel', email: 'arjun@test.com', employeeId: 'E000103', stage: 'invited', documentsUploaded: 0, documentsTotal: 3, createdAt: new Date() },
        ]),
      )

      const res = await request(createApp())
        .get('/api/v1/onboarding/pipeline')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.pipeline.invited).toBe(2)
      expect(res.body.pipeline.docsPending).toBe(1)
      expect(res.body.candidates).toBeDefined()
      expect(res.body.candidates).toHaveLength(1)
    })

    it('returns 403 for non-hr/admin', async () => {
      setupAuth('employee')

      const res = await request(createApp())
        .get('/api/v1/onboarding/pipeline')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(403)
    })
  })

  describe('GET /employees', () => {
    it('returns employee directory', async () => {
      setupAuth('hr')

      const usersCollection = mockCollections[COLLECTIONS.USERS]
      usersCollection.find.mockReturnValue(
        createChainableCursor([
          mockUser(makeUserId(), { role: 'employee', status: 'active' }),
          mockUser(makeUserId(), { role: 'employee', status: 'active' }),
        ]),
      )

      const res = await request(createApp())
        .get('/api/v1/employees')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.users).toHaveLength(2)
      expect(res.body.total).toBe(2)
      expect(res.body.users[0]).toHaveProperty('id')
      expect(res.body.users[0]).toHaveProperty('name')
      expect(res.body.users[0]).toHaveProperty('role')
    })

    it('returns 403 for employee role', async () => {
      setupAuth('employee')

      const res = await request(createApp())
        .get('/api/v1/employees')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(403)
    })
  })

  describe('POST /employees (wizard-create to directory-visible)', () => {
    it('creates an employee and returns accessToken', async () => {
      const hrUserId = setupAuth('hr')

      vi.mocked(jwt.signAccessToken).mockResolvedValue('mock-access-token')

      // Ensure findOne returns null for duplicate check (different _id from HR user)
      const usersCollection = mockCollections[COLLECTIONS.USERS]
      usersCollection.findOne = vi.fn().mockImplementation((filter: any) => {
        const filterId = filter?._id
        if (filterId && String(filterId) === hrUserId) {
          return Promise.resolve(mockUser(hrUserId, { role: 'hr' }))
        }
        return Promise.resolve(null)
      })

      const res = await request(createApp())
        .post('/api/v1/employees')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'New Employee',
          email: 'new@test.com',
          employeeId: 'E000200',
          department: 'Engineering',
          role: 'employee',
          billable: true,
          payRate: 90,
          currency: 'USD',
        })

      expect(res.status).toBe(201)
      expect(res.body.user).toBeDefined()
      expect(res.body.user.name).toBe('New Employee')
      expect(res.body.user.email).toBe('new@test.com')
      expect(res.body.user.employeeId).toBe('E000200')
      expect(res.body.user.role).toBe('employee')
      expect(res.body.user.status).toBe('invited')
      expect(res.body.accessToken).toBe('mock-access-token')
    })

    it('returns 400 when billable without payRate', async () => {
      setupAuth('hr')

      const res = await request(createApp())
        .post('/api/v1/employees')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'New Employee',
          email: 'new@test.com',
          employeeId: 'E000200',
          department: 'Engineering',
          role: 'employee',
          billable: true,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BILLABLE_WITHOUT_RATE')
    })
  })

  describe('GET /employees/:id', () => {
    it('returns employee detail with payrate history and documents', async () => {
      const adminUserId = setupAuth('admin')
      const targetUserId = makeUserId()

      // Smart findOne: returns admin for auth, target employee for detail lookup
      const usersCollection = mockCollections[COLLECTIONS.USERS]
      usersCollection.findOne = vi.fn().mockImplementation((filter: any) => {
        const filterId = filter?._id
        if (filterId && String(filterId) === adminUserId) {
          return Promise.resolve(mockUser(adminUserId, { role: 'admin' }))
        }
        if (filterId && String(filterId) === targetUserId) {
          return Promise.resolve(mockUser(targetUserId, { role: 'employee', name: 'John Doe', employeeId: 'E000001' }))
        }
        return Promise.resolve(null)
      })

      const payrateCollection = mockCollections[COLLECTIONS.PAYRATE_HISTORY]
      const documentsCollection = mockCollections[COLLECTIONS.DOCUMENTS]
      payrateCollection.find.mockReturnValue(
        createChainableCursor([
          { _id: new ObjectId(), userId: new ObjectId(targetUserId), oldRate: 80, newRate: 85, currency: 'USD', reason: 'Annual review', changedBy: 'Hina Rao', createdAt: new Date() },
        ]),
      )
      documentsCollection.find.mockReturnValue(createChainableCursor([]))

      const res = await request(createApp())
        .get(`/api/v1/employees/${targetUserId}`)
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.user.id).toBe(targetUserId)
      expect(res.body.user.name).toBe('John Doe')
      expect(res.body.payrateHistory).toHaveLength(1)
      expect(res.body.payrateHistory[0].oldRate).toBe(80)
      expect(res.body.payrateHistory[0].newRate).toBe(85)
      expect(res.body.payrateHistory[0].reason).toBe('Annual review')
      expect(res.body.documents).toEqual([])
    })

    it('returns 404 for non-existent employee', async () => {
      const adminUserId = setupAuth('admin')

      const usersCollection = mockCollections[COLLECTIONS.USERS]
      // findOne returns admin for auth, null for employee lookup (non-existent)
      usersCollection.findOne = vi.fn().mockImplementation((filter: any) => {
        const filterId = filter?._id
        if (filterId && String(filterId) === adminUserId) {
          return Promise.resolve(mockUser(adminUserId, { role: 'admin' }))
        }
        return Promise.resolve(null)
      })

      const res = await request(createApp())
        .get('/api/v1/employees/507f1f77bcf86cd799439099')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('PATCH /employees/:id', () => {
    it('returns 400 when deactivating the last active admin', async () => {
      const adminUserId = setupAuth('admin')

      const usersCollection = mockCollections[COLLECTIONS.USERS]
      const empId = makeUserId()

      // find returns multiple users for the guardrail check
      usersCollection.find.mockReturnValue(
        createChainableCursor([
          mockUser(makeUserId(), { role: 'hr', name: 'HR User' }),
          mockUser(empId, { role: 'admin', name: 'Last Admin' }),
        ]),
      )
      // findOne returns admin for auth, employee for update lookup
      usersCollection.findOne = vi.fn().mockImplementation((filter: any) => {
        const filterId = filter?._id
        if (filterId && String(filterId) === adminUserId) {
          return Promise.resolve(mockUser(adminUserId, { role: 'admin' }))
        }
        if (filterId && String(filterId) === empId) {
          return Promise.resolve(mockUser(empId, { role: 'admin', name: 'Last Admin' }))
        }
        return Promise.resolve(null)
      })

      const res = await request(createApp())
        .patch(`/api/v1/employees/${empId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'inactive' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('LAST_ADMIN')
    })

    it('updates employee successfully', async () => {
      const hrUserId = setupAuth('hr')
      const empId = makeUserId()

      const usersCollection = mockCollections[COLLECTIONS.USERS]
      // find returns multiple admins/HR + the employee being updated (for guardrail)
      usersCollection.find.mockReturnValue(
        createChainableCursor([
          mockUser(makeUserId(), { role: 'admin', name: 'Admin' }),
          mockUser(makeUserId(), { role: 'hr', name: 'HR' }),
          mockUser(empId, { role: 'employee', name: 'Employee' }),
        ]),
      )
      // findOne returns HR for auth, employee for update lookup
      usersCollection.findOne = vi.fn().mockImplementation((filter: any) => {
        const filterId = filter?._id
        if (filterId && String(filterId) === hrUserId) {
          return Promise.resolve(mockUser(hrUserId, { role: 'hr' }))
        }
        if (filterId && String(filterId) === empId) {
          return Promise.resolve(mockUser(empId, { role: 'employee', name: 'Employee' }))
        }
        return Promise.resolve(null)
      })

      const res = await request(createApp())
        .patch(`/api/v1/employees/${empId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'Updated Name', department: 'New Dept' })

      expect(res.status).toBe(200)
      expect(res.body.user).toBeDefined()
      expect(usersCollection.updateOne).toHaveBeenCalled()
    })

    it('writes payrate history on payRate change', async () => {
      const hrUserId = setupAuth('hr')
      const empId = makeUserId()

      const usersCollection = mockCollections[COLLECTIONS.USERS]
      usersCollection.find.mockReturnValue(
        createChainableCursor([
          mockUser(makeUserId(), { role: 'admin', name: 'Admin' }),
          mockUser(makeUserId(), { role: 'hr', name: 'HR' }),
          mockUser(empId, { role: 'employee', name: 'Employee', payRate: 80 }),
        ]),
      )
      usersCollection.findOne = vi.fn().mockImplementation((filter: any) => {
        const filterId = filter?._id
        if (filterId && String(filterId) === hrUserId) {
          return Promise.resolve(mockUser(hrUserId, { role: 'hr' }))
        }
        if (filterId && String(filterId) === empId) {
          return Promise.resolve(mockUser(empId, { role: 'employee', name: 'Employee', payRate: 80, currency: 'USD' }))
        }
        return Promise.resolve(null)
      })

      const res = await request(createApp())
        .patch(`/api/v1/employees/${empId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ payRate: 90, currency: 'USD' })

      expect(res.status).toBe(200)
      expect(mockCollections[COLLECTIONS.PAYRATE_HISTORY].insertOne).toHaveBeenCalled()
    })

    it('returns 400 when setting billable without payRate', async () => {
      const hrUserId = setupAuth('hr')
      const empId = makeUserId()

      const usersCollection = mockCollections[COLLECTIONS.USERS]
      usersCollection.find.mockReturnValue(
        createChainableCursor([
          mockUser(makeUserId(), { role: 'admin', name: 'Admin' }),
          mockUser(makeUserId(), { role: 'hr', name: 'HR' }),
          mockUser(empId, { role: 'employee', name: 'Employee', billable: false, payRate: null }),
        ]),
      )
      usersCollection.findOne = vi.fn().mockImplementation((filter: any) => {
        const filterId = filter?._id
        if (filterId && String(filterId) === hrUserId) {
          return Promise.resolve(mockUser(hrUserId, { role: 'hr' }))
        }
        if (filterId && String(filterId) === empId) {
          return Promise.resolve(mockUser(empId, { role: 'employee', name: 'Employee', billable: false, payRate: null, currency: 'USD' }))
        }
        return Promise.resolve(null)
      })

      const res = await request(createApp())
        .patch(`/api/v1/employees/${empId}`)
        .set('Authorization', 'Bearer valid-token')
        .send({ billable: true })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BILLABLE_WITHOUT_RATE')
    })
  })

  describe('GET /departments', () => {
    it('returns list of departments', async () => {
      setupAuth('admin')

      const departmentsCollection = mockCollections[COLLECTIONS.DEPARTMENTS]
      departmentsCollection.find.mockReturnValue(createChainableCursor([{ name: 'Custom Dept' }]))

      const res = await request(createApp())
        .get('/api/v1/employees/departments')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.departments).toBeDefined()
      expect(res.body.departments).toContain('Custom Dept')
      expect(res.body.departments).toContain('Engineering')
    })
  })

  describe('GET /payrate/history', () => {
    it('returns payrate history', async () => {
      setupAuth('admin')

      const payrateCollection = mockCollections[COLLECTIONS.PAYRATE_HISTORY]
      const usersCollection = mockCollections[COLLECTIONS.USERS]
      const targetUserId = '507f1f77bcf86cd799439001'

      payrateCollection.find.mockReturnValue(
        createChainableCursor([
          { _id: new ObjectId(), userId: new ObjectId(targetUserId), oldRate: null, newRate: 80, currency: 'USD', reason: 'Initial hire', changedBy: 'Hina Rao', createdAt: new Date() },
        ]),
      )
      usersCollection.find.mockReturnValue(
        createChainableCursor([
          { _id: new ObjectId(targetUserId), name: 'Esha Employee', employeeId: 'E000101' },
        ]),
      )

      const res = await request(createApp())
        .get('/api/v1/employees/payrate/history')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].employeeName).toBe('Esha Employee')
      expect(res.body[0].newRate).toBe(80)
    })
  })
})
