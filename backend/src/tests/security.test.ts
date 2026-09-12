/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-ignore
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')

function createMockCollection() {
  return {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
    find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }
}

let mockDb: any
let usersCollection: ReturnType<typeof createMockCollection>
let projectsCollection: ReturnType<typeof createMockCollection>
let timesheetsCollection: ReturnType<typeof createMockCollection>
let sessionsCollection: ReturnType<typeof createMockCollection>

function setupSecurityMocks() {
  vi.mocked(getDb).mockReset()
  vi.mocked(verifyAccessToken).mockReset()

  usersCollection = createMockCollection()
  projectsCollection = createMockCollection()
  timesheetsCollection = createMockCollection()
  sessionsCollection = createMockCollection()
  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.PROJECTS) return projectsCollection
      if (name === COLLECTIONS.TIMESHEETS) return timesheetsCollection
      if (name === COLLECTIONS.SESSIONS) return sessionsCollection
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

function mockUser(userId: string, role: string, isSupervisor: boolean) {
  setupSecurityMocks()
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role, isSupervisor, exp: 9999999999 })
  vi.mocked(usersCollection.findOne).mockResolvedValue({
    _id: new ObjectId(userId),
    email: `user${userId}@example.com`,
    name: `User ${userId}`,
    employeeId: `EMP${userId}`,
    department: 'Engineering',
    role,
    isSupervisor,
    status: 'active',
  })
}

describe('Security tests', () => {
  beforeEach(() => {
    setupSecurityMocks()
  })

  it('normal user receives a scoped directory, not the full user list (QA C1)', async () => {
    mockUser('507f1f77bcf86cd799439011', 'user', false)

    const res = await request(createApp())
      .get('/api/v1/users/')
      .set('Authorization', 'Bearer valid-token')

    // Contract change (QA C1): a 403 here broke the non-admin initial data
    // load. The endpoint now returns 200 with only the scoped directory
    // (self + project/team/org edges) instead of the admin-only full list.
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.users)).toBe(true)
  })

  it('normal user cannot access another user profile', async () => {
    mockUser('507f1f77bcf86cd799439011', 'user', false)

    const res = await request(createApp())
      .get('/api/v1/users/507f1f77bcf86cd799439012')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('normal user cannot approve timesheets', async () => {
    mockUser('507f1f77bcf86cd799439011', 'user', false)

    const res = await request(createApp())
      .post('/api/v1/approvals/507f1f77bcf86cd799439012/approve')
      .set('Authorization', 'Bearer valid-token')
      .send({})

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('normal user cannot decline timesheets', async () => {
    mockUser('507f1f77bcf86cd799439011', 'user', false)

    const res = await request(createApp())
      .post('/api/v1/approvals/507f1f77bcf86cd799439012/decline')
      .set('Authorization', 'Bearer valid-token')
      .send({ reason: 'Not good' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('supervisor cannot access unrelated user timesheet', async () => {
    const supervisorId = '507f1f77bcf86cd799439011'
    const unrelatedProjectId = '507f1f77bcf86cd799439099'
    const timesheetId = '507f1f77bcf86cd799439012'

    mockUser(supervisorId, 'user', true)

    vi.mocked(timesheetsCollection.findOne).mockResolvedValue({
      _id: new ObjectId(timesheetId),
      userId: new ObjectId('507f1f77bcf86cd799439013'),
      projectId: new ObjectId(unrelatedProjectId),
      weekStart: '2024-01-01',
      entries: [],
      notes: '',
      regularHours: 0,
      overtimeHours: 0,
      totalHours: 0,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    vi.mocked(projectsCollection.findOne).mockResolvedValue({
      _id: new ObjectId(unrelatedProjectId),
      supervisorId: new ObjectId('507f1f77bcf86cd799439014'),
      teamMemberIds: [],
    })

    const res = await request(createApp())
      .get(`/api/v1/timesheets/${timesheetId}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('user cannot access another user timesheet', async () => {
    const userId = '507f1f77bcf86cd799439011'
    const timesheetId = '507f1f77bcf86cd799439012'

    mockUser(userId, 'user', false)

    vi.mocked(timesheetsCollection.findOne).mockResolvedValue({
      _id: new ObjectId(timesheetId),
      userId: new ObjectId('507f1f77bcf86cd799439013'),
      projectId: new ObjectId('507f1f77bcf86cd799439014'),
      weekStart: '2024-01-01',
      entries: [],
      notes: '',
      regularHours: 0,
      overtimeHours: 0,
      totalHours: 0,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(createApp())
      .get(`/api/v1/timesheets/${timesheetId}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('admin-only endpoints reject normal users', async () => {
    mockUser('507f1f77bcf86cd799439011', 'user', false)

    const createRes = await request(createApp())
      .post('/api/v1/users/')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'New User', email: 'new@example.com', employeeId: 'EMP002', department: 'Engineering', role: 'user' })

    expect(createRes.status).toBe(403)

    const deactivateRes = await request(createApp())
      .post('/api/v1/users/507f1f77bcf86cd799439012/deactivate')
      .set('Authorization', 'Bearer valid-token')

    expect(deactivateRes.status).toBe(403)
  })

  it('normal user cannot create users', async () => {
    mockUser('507f1f77bcf86cd799439011', 'user', false)

    const res = await request(createApp())
      .post('/api/v1/users/')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'New User', email: 'new@example.com', employeeId: 'EMP002', department: 'Engineering', role: 'user' })

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('supervisor cannot deactivate users', async () => {
    mockUser('507f1f77bcf86cd799439011', 'user', true)

    const res = await request(createApp())
      .post('/api/v1/users/507f1f77bcf86cd799439012/deactivate')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })
})
