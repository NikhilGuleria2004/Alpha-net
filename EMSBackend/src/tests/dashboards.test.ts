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
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    insertMany: vi.fn().mockResolvedValue({ insertedIds: [] }),
    aggregate: vi.fn(() => createChainableCursor([])),
    find: vi.fn(() => createChainableCursor(docs)),
  }
}

let mockDb: any
let mockCollections: Record<string, any>

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
  usersCollection.findOne.mockResolvedValue(mockUser(userId, { role, ...overrides }))
  return userId
}

describe('Dashboards', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  describe('zeroed defaults for empty org', () => {
    it('admin dashboard returns zeroed defaults', async () => {
      setupAuth('admin')

      const res = await request(createApp())
        .get('/api/v1/dashboard/admin')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      const data = res.body
      expect(data.role).toBe('admin')
      expect(data.activeEmployees).toEqual({ total: 0, billable: 0, nonBillable: 0 })
      expect(data.openClientIds).toBe(0)
      expect(data.activeProjects).toBe(0)
      expect(data.attendanceToday).toEqual({ present: 0, absent: 0, late: 0 })
      expect(data.revenueAtRisk.amount).toBe(0)
      expect(data.headcountTrend).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ date: expect.any(String), count: 0 }),
        ])
      )
      expect(data.attendanceRate).toEqual(expect.any(Array))
      expect(data.projectStatusDonut).toEqual([])
      expect(data.recentAudit).toEqual([])
      expect(data.failedLogins).toBe(0)
      expect(data.integrations).toBeDefined()
      expect(data.upcomingRenewals).toEqual([])
      expect(data.roleDistribution).toEqual([])
      expect(data.latestOnboardings).toEqual([])
      expect(data.updatedAt).toBeDefined()
    })

    it('hr dashboard returns zeroed defaults', async () => {
      setupAuth('hr')

      const res = await request(createApp())
        .get('/api/v1/dashboard/hr')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.totalHeadcount).toBe(0)
      expect(res.body.newThisMonth).toBe(0)
      expect(res.body.pendingOnboardings).toBe(0)
      expect(res.body.onLeaveToday).toBe(0)
      expect(typeof res.body.attendanceCompliance).toBe('number')
      expect(res.body.onboardingPipeline).toEqual(
        expect.objectContaining({ invited: 0, docsPending: 0, payratePending: 0, ready: 0, active: 0 })
      )
      expect(res.body.attendanceExceptions).toEqual([])
      expect(res.body.payrateChangesPending).toEqual([])
      expect(res.body.upcomingBirthdays).toEqual([])
      expect(res.body.upcomingAnniversaries).toEqual([])
      expect(res.body.leaveCalendar).toEqual([])
      expect(res.body.documentExpiries).toEqual([])
      expect(res.body.updatedAt).toBeDefined()
    })

    it('manager dashboard returns zeroed defaults', async () => {
      setupAuth('manager')

      const res = await request(createApp())
        .get('/api/v1/dashboard/manager')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.activeClients).toBe(0)
      expect(res.body.activeProjects).toBe(0)
      expect(res.body.unassignedResources).toBe(0)
      expect(typeof res.body.utilizationPercent).toBe('number')
      expect(res.body.billableHoursWeek).toBe(0)
      expect(res.body.pipelineStages).toEqual([])
      expect(res.body.assignmentQueue).toEqual([])
      expect(res.body.projectHealth).toEqual([])
      expect(res.body.topClientsByHours).toEqual([])
      expect(res.body.capacityVsDemand).toBeDefined()
      expect(res.body.updatedAt).toBeDefined()
    })


    it('employee dashboard returns zeroed defaults', async () => {
      setupAuth('employee')

      const res = await request(createApp())
        .get('/api/v1/dashboard/employee')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.attendanceStreak).toBe(0)
      expect(res.body.hoursThisWeek).toBe(0)
      expect(res.body.assignedProjects).toBe(0)
      expect(res.body.pendingLeaveRequests).toBe(0)
      expect(res.body.todayAttendance).toEqual({
        marked: false,
        nextAction: 'Tap to mark your attendance for today.',
      })
      expect(res.body.myWeekHours).toEqual([0, 0, 0, 0, 0, 0, 0])
      expect(res.body.myAssignments).toEqual([])
      expect(res.body.openTimesheetHandoff).toBe(true)
      expect(res.body.documentsToSign).toEqual([])
      expect(res.body.recentNotifications).toEqual([])
      expect(res.body.updatedAt).toBeDefined()
    })
  })

  describe('authorization', () => {
    it('employee cannot access admin dashboard (403)', async () => {
      setupAuth('employee')

      const res = await request(createApp())
        .get('/api/v1/dashboard/admin')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(403)
    })

    it('manager can access admin dashboard (200)', async () => {
      setupAuth('manager')

      const res = await request(createApp())
        .get('/api/v1/dashboard/admin')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
    })

    it('admin can access admin dashboard (200)', async () => {
      setupAuth('admin')

      const res = await request(createApp())
        .get('/api/v1/dashboard/admin')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
    })

    it('hr can access admin dashboard (200)', async () => {
      setupAuth('hr')

      const res = await request(createApp())
        .get('/api/v1/dashboard/admin')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
    })

    it('hr can access hr dashboard (200)', async () => {
      setupAuth('hr')

      const res = await request(createApp())
        .get('/api/v1/dashboard/hr')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
    })

    it('manager cannot access hr dashboard (403)', async () => {
      setupAuth('manager')

      const res = await request(createApp())
        .get('/api/v1/dashboard/hr')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(403)
    })

    it('manager can access manager dashboard (200)', async () => {
      setupAuth('manager')

      const res = await request(createApp())
        .get('/api/v1/dashboard/manager')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
    })

    it('employee cannot access manager dashboard (403)', async () => {
      setupAuth('employee')

      const res = await request(createApp())
        .get('/api/v1/dashboard/manager')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(403)
    })



    it('employee can access employee dashboard (200)', async () => {
      setupAuth('employee')

      const res = await request(createApp())
        .get('/api/v1/dashboard/employee')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
    })

    it('unauthenticated request returns 401', async () => {
      const res = await request(createApp()).get('/api/v1/dashboard/admin')
      expect(res.status).toBe(401)
    })
  })

  describe('shape parity (frontend type contract)', () => {
    it('admin dashboard matches frontend AdminDashboardData contract', async () => {
      setupAuth('admin')

      const res = await request(createApp())
        .get('/api/v1/dashboard/admin')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      const body = res.body

      expect(body.role).toBe('admin')
      expect(body.updatedAt).toEqual(expect.any(String))
      expect(body.activeEmployees).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          billable: expect.any(Number),
          nonBillable: expect.any(Number),
        }),
      )
      expect(body.openClientIds).toEqual(expect.any(Number))
      expect(body.activeProjects).toEqual(expect.any(Number))
      expect(body.attendanceToday).toEqual(
        expect.objectContaining({
          present: expect.any(Number),
          absent: expect.any(Number),
          late: expect.any(Number),
        }),
      )
      expect(body.revenueAtRisk).toEqual(
        expect.objectContaining({
          amount: expect.any(Number),
          currency: expect.any(String),
          projectCount: expect.any(Number),
        }),
      )
      expect(body.headcountTrend).toEqual(expect.any(Array))
      expect(body.attendanceRate).toEqual(expect.any(Array))
      expect(body.projectStatusDonut).toEqual(expect.any(Array))
      expect(body.recentAudit).toEqual(expect.any(Array))
      expect(body.failedLogins).toEqual(expect.any(Number))
      expect(body.integrations).toEqual(expect.any(Array))
      expect(body.upcomingRenewals).toEqual(expect.any(Array))
      expect(body.roleDistribution).toEqual(expect.any(Array))
      expect(body.latestOnboardings).toEqual(expect.any(Array))
    })

    it('hr dashboard matches frontend HrDashboardData contract', async () => {
      setupAuth('hr')

      const res = await request(createApp())
        .get('/api/v1/dashboard/hr')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      const body = res.body

      expect(body.role).toBe('hr')
      expect(body.totalHeadcount).toEqual(expect.any(Number))
      expect(body.newThisMonth).toEqual(expect.any(Number))
      expect(body.pendingOnboardings).toEqual(expect.any(Number))
      expect(body.onLeaveToday).toEqual(expect.any(Number))
      expect(body.attendanceCompliance).toEqual(expect.any(Number))
      expect(body.onboardingPipeline).toEqual(
        expect.objectContaining({
          invited: expect.any(Number),
          docsPending: expect.any(Number),
          payratePending: expect.any(Number),
          ready: expect.any(Number),
          active: expect.any(Number),
        }),
      )
      expect(body.attendanceExceptions).toEqual(expect.any(Array))
      expect(body.payrateChangesPending).toEqual(expect.any(Array))
      expect(body.upcomingBirthdays).toEqual(expect.any(Array))
      expect(body.upcomingAnniversaries).toEqual(expect.any(Array))
      expect(body.leaveCalendar).toEqual(expect.any(Array))
      expect(body.documentExpiries).toEqual(expect.any(Array))
      expect(body.updatedAt).toEqual(expect.any(String))
    })

    it('manager dashboard matches frontend ManagerDashboardData contract', async () => {
      setupAuth('manager')

      const res = await request(createApp())
        .get('/api/v1/dashboard/manager')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      const body = res.body

      expect(body.role).toBe('manager')
      expect(body.activeClients).toEqual(expect.any(Number))
      expect(body.activeProjects).toEqual(expect.any(Number))
      expect(body.unassignedResources).toEqual(expect.any(Number))
      expect(body.utilizationPercent).toEqual(expect.any(Number))
      expect(body.billableHoursWeek).toEqual(expect.any(Number))
      expect(body.pipelineStages).toEqual(expect.any(Array))
      expect(body.assignmentQueue).toEqual(expect.any(Array))
      expect(body.projectHealth).toEqual(expect.any(Array))
      expect(body.topClientsByHours).toEqual(expect.any(Array))
      expect(body.capacityVsDemand).toEqual(expect.any(Array))
      expect(body.updatedAt).toEqual(expect.any(String))
    })


    it('employee dashboard matches frontend EmployeeDashboardData contract', async () => {
      setupAuth('employee')

      const res = await request(createApp())
        .get('/api/v1/dashboard/employee')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      const body = res.body

      expect(body.role).toBe('employee')
      expect(body.attendanceStreak).toEqual(expect.any(Number))
      expect(body.hoursThisWeek).toEqual(expect.any(Number))
      expect(body.assignedProjects).toEqual(expect.any(Number))
      expect(body.pendingLeaveRequests).toEqual(expect.any(Number))
      expect(body.todayAttendance).toEqual(
        expect.objectContaining({
          marked: expect.any(Boolean),
          nextAction: expect.any(String),
        }),
      )
      expect(body.myWeekHours).toEqual(expect.arrayContaining([expect.any(Number)]))
      expect(body.myAssignments).toEqual(expect.any(Array))
      expect(body.openTimesheetHandoff).toEqual(expect.any(Boolean))
      expect(body.documentsToSign).toEqual(expect.any(Array))
      expect(body.recentNotifications).toEqual(expect.any(Array))
      expect(body.updatedAt).toEqual(expect.any(String))
    })
  })
})
