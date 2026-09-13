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

// S3 regression (QA_REPORT.md): POST /activities previously accepted
// caller-supplied userId/projectId/timesheetId — any user could forge journal
// entries attributed to anyone, and invalid ObjectIds leaked raw Mongo errors
// as 500s. The endpoint now requires authentication, derives the actor from the
// session, and only accepts projectId/timesheetId when the caller has access.
describe('POST /api/v1/activities (S3 regression)', () => {
  const collection = {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })),
  }
  const db = { collection: vi.fn(() => collection) }

  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(verifyAccessToken).mockReset()
    vi.mocked(collection.findOne).mockReset()
    vi.mocked(collection.insertOne).mockReset()
    vi.mocked(getDb).mockResolvedValue(db as any)
  })

  it('rejects attempts to forge an activity for another user', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: '507f1f77bcf86cd799439011',
      role: 'user',
      isSupervisor: false,
      exp: 9999999999,
    })
    vi.mocked(collection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'user@example.com',
      name: 'User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })
    vi.mocked(collection.insertOne).mockResolvedValue({
      insertedId: new ObjectId('507f1f77bcf86cd799439098'),
    })

    const res = await request(createApp())
      .post('/api/v1/activities')
      .set('Authorization', 'Bearer valid-token')
      .send({ userId: '507f1f77bcf86cd799439012', description: 'forged activity' })

    expect(res.status).toBe(201)
    expect(collection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: new ObjectId('507f1f77bcf86cd799439011'),
      })
    )
    expect((collection.insertOne.mock.calls[0]?.[0] as any)?.userId?.toString()).toBe('507f1f77bcf86cd799439011')
  })

  it('rejects invalid projectId with a clean error instead of a raw Mongo failure', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: '507f1f77bcf86cd799439011',
      role: 'user',
      isSupervisor: false,
      exp: 9999999999,
    })
    vi.mocked(collection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'user@example.com',
      name: 'User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })
    vi.mocked(collection.insertOne).mockResolvedValue({
      insertedId: new ObjectId('507f1f77bcf86cd799439098'),
    })

    const res = await request(createApp())
      .post('/api/v1/activities')
      .set('Authorization', 'Bearer valid-token')
      .send({ projectId: 'not-an-objectid', description: 'test' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('creates a project-scoped activity when the caller can access the project', async () => {
    const userId = '507f1f77bcf86cd799439011'
    const projectId = '507f1f77bcf86cd799439012'
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId,
      role: 'user',
      isSupervisor: false,
      exp: 9999999999,
    })
    vi.mocked(collection.findOne).mockResolvedValue({
      _id: new ObjectId(userId),
      email: 'user@example.com',
      name: 'User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })
    vi.mocked(collection.findOne).mockImplementation((query: any) => {
      if (query._id instanceof ObjectId && query._id.toString() === projectId) {
        return Promise.resolve({
          _id: new ObjectId(projectId),
          teamMemberIds: [new ObjectId(userId)],
          supervisorId: new ObjectId('507f1f77bcf86cd799439099'),
        })
      }
      if (query.email !== undefined || query.employeeId !== undefined) {
        return Promise.resolve(null)
      }
      if (query._id instanceof ObjectId && query._id.toString() === userId) {
        return Promise.resolve({
          _id: new ObjectId(userId),
          email: 'user@example.com',
          name: 'User',
          employeeId: 'EMP001',
          department: 'Engineering',
          role: 'user',
          isSupervisor: false,
          status: 'active',
        })
      }
      return Promise.resolve(null)
    })
    vi.mocked(collection.insertOne).mockResolvedValue({
      insertedId: new ObjectId('507f1f77bcf86cd799439099'),
    })

    const res = await request(createApp())
      .post('/api/v1/activities')
      .set('Authorization', 'Bearer valid-token')
      .send({ projectId, description: 'linked activity' })

    expect(res.status).toBe(201)
    expect(res.body.activity.projectId).toBe(projectId)
    expect(res.body.activity.userId).toBe(userId)
  })
})

// S4 regression (QA_REPORT.md): GET /activities/projects/:projectId and
// /activities/timesheets/:timesheetId previously had no access checks — any
// authenticated user could enumerate activity for arbitrary resource IDs.
// Both endpoints now enforce project/timesheet access.
describe('GET /api/v1/activities/projects/:projectId (S4 regression)', () => {
  const collection = {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })),
  }
  const db = { collection: vi.fn(() => collection) }

  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(verifyAccessToken).mockReset()
    vi.mocked(collection.findOne).mockReset()
    vi.mocked(collection.find).mockReset()
    vi.mocked(getDb).mockResolvedValue(db as any)
  })

  it('returns 403 when the caller has no access to the project', async () => {
    const projectId = '507f1f77bcf86cd799439012'
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: '507f1f77bcf86cd799439011',
      role: 'user',
      isSupervisor: false,
      exp: 9999999999,
    })
    vi.mocked(collection.findOne).mockImplementation((query: any) => {
      if (query._id instanceof ObjectId && query._id.toString() === '507f1f77bcf86cd799439011') {
        return Promise.resolve({
          _id: new ObjectId('507f1f77bcf86cd799439011'),
          email: 'user@example.com',
          name: 'User',
          employeeId: 'EMP001',
          department: 'Engineering',
          role: 'user',
          isSupervisor: false,
          status: 'active',
        })
      }
      return Promise.resolve(null)
    })

    const res = await request(createApp())
      .get(`/api/v1/activities/projects/${projectId}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('returns activities when the caller is a project member', async () => {
    const userId = '507f1f77bcf86cd799439011'
    const projectId = '507f1f77bcf86cd799439012'
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId,
      role: 'user',
      isSupervisor: false,
      exp: 9999999999,
    })
    vi.mocked(collection.findOne).mockImplementation((query: any) => {
      if (query._id instanceof ObjectId && query._id.toString() === projectId) {
        return Promise.resolve({
          _id: new ObjectId(projectId),
          teamMemberIds: [new ObjectId(userId)],
          supervisorId: new ObjectId('507f1f77bcf86cd799439099'),
        })
      }
      if (query._id instanceof ObjectId && query._id.toString() === userId) {
        return Promise.resolve({
          _id: new ObjectId(userId),
          email: 'user@example.com',
          name: 'User',
          employeeId: 'EMP001',
          department: 'Engineering',
          role: 'user',
          isSupervisor: false,
          status: 'active',
        })
      }
      return Promise.resolve(null)
    })
    vi.mocked(collection.find).mockReturnValue({
      sort: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          { _id: new ObjectId('507f1f77bcf86cd799439098'), userId: new ObjectId(userId), projectId: new ObjectId(projectId), description: 'test', createdAt: new Date() },
        ]),
      })),
    } as any)

    const res = await request(createApp())
      .get(`/api/v1/activities/projects/${projectId}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.activities).toHaveLength(1)
    expect(res.body.activities[0].projectId).toBe(projectId)
  })
})

describe('GET /api/v1/activities/timesheets/:timesheetId (S4 regression)', () => {
  const collection = {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })),
  }
  const db = { collection: vi.fn(() => collection) }

  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(verifyAccessToken).mockReset()
    vi.mocked(collection.findOne).mockReset()
    vi.mocked(collection.find).mockReset()
    vi.mocked(getDb).mockResolvedValue(db as any)
  })

  it('returns 403 when the caller has no access to the timesheet', async () => {
    const timesheetId = '507f1f77bcf86cd799439013'
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: '507f1f77bcf86cd799439011',
      role: 'user',
      isSupervisor: false,
      exp: 9999999999,
    })
    vi.mocked(collection.findOne).mockImplementation((query: any) => {
      if (query._id instanceof ObjectId && query._id.toString() === '507f1f77bcf86cd799439011') {
        return Promise.resolve({
          _id: new ObjectId('507f1f77bcf86cd799439011'),
          email: 'user@example.com',
          name: 'User',
          employeeId: 'EMP001',
          department: 'Engineering',
          role: 'user',
          isSupervisor: false,
          status: 'active',
        })
      }
      return Promise.resolve(null)
    })

    const res = await request(createApp())
      .get(`/api/v1/activities/timesheets/${timesheetId}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('returns activities when the caller owns the timesheet', async () => {
    const userId = '507f1f77bcf86cd799439011'
    const timesheetId = '507f1f77bcf86cd799439013'
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId,
      role: 'user',
      isSupervisor: false,
      exp: 9999999999,
    })
    vi.mocked(collection.findOne).mockImplementation((query: any) => {
      if (query._id instanceof ObjectId && query._id.toString() === timesheetId) {
        return Promise.resolve({
          _id: new ObjectId(timesheetId),
          userId: new ObjectId(userId),
          projectId: new ObjectId('507f1f77bcf86cd799439012'),
          status: 'draft',
        })
      }
      if (query._id instanceof ObjectId && query._id.toString() === userId) {
        return Promise.resolve({
          _id: new ObjectId(userId),
          email: 'user@example.com',
          name: 'User',
          employeeId: 'EMP001',
          department: 'Engineering',
          role: 'user',
          isSupervisor: false,
          status: 'active',
        })
      }
      return Promise.resolve(null)
    })
    vi.mocked(collection.find).mockReturnValue({
      sort: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          { _id: new ObjectId('507f1f77bcf86cd799439098'), userId: new ObjectId(userId), timesheetId: new ObjectId(timesheetId), description: 'test', createdAt: new Date() },
        ]),
      })),
    } as any)

    const res = await request(createApp())
      .get(`/api/v1/activities/timesheets/${timesheetId}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.activities).toHaveLength(1)
    expect(res.body.activities[0].timesheetId).toBe(timesheetId)
  })
})

