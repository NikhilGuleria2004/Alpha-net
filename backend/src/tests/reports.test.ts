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
    aggregate: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }
}

let mockDb: any
let usersCollection: ReturnType<typeof createMockCollection>
let projectsCollection: ReturnType<typeof createMockCollection>
let timesheetsCollection: ReturnType<typeof createMockCollection>

function setupMocks() {
  vi.mocked(getDb).mockReset()
  vi.mocked(verifyAccessToken).mockReset()

  usersCollection = createMockCollection()
  projectsCollection = createMockCollection()
  timesheetsCollection = createMockCollection()
  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.PROJECTS) return projectsCollection
      if (name === COLLECTIONS.TIMESHEETS) return timesheetsCollection
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

function mockAdmin() {
  setupMocks()
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId: '507f1f77bcf86cd799439011', role: 'admin', isSupervisor: false, exp: 9999999999 })
  vi.mocked(usersCollection.findOne).mockResolvedValue({
    _id: new ObjectId('507f1f77bcf86cd799439011'),
    email: 'admin@example.com',
    name: 'Admin User',
    employeeId: 'EMP001',
    department: 'Engineering',
    role: 'admin',
    isSupervisor: false,
    status: 'active',
  })
}

// Regression guard for QA_REPORT.md C8: the Reports UI sends startDate/endDate
// for every preset; the backend must actually translate those into a weekStart
// range match — otherwise presets silently report all-time data.
describe('GET /api/v1/reports/hours-by-project', () => {
  beforeEach(() => {
    mockAdmin()
  })

  it('translates startDate/endDate query params into a weekStart $match range', async () => {
    const aggregateMock = vi.fn((_pipeline: Record<string, unknown>[]) => ({ toArray: vi.fn().mockResolvedValue([]) }))
    timesheetsCollection.aggregate = aggregateMock as any

    const res = await request(createApp())
      .get('/api/v1/reports/hours-by-project')
      .set('Authorization', 'Bearer valid-token')
      .query({ startDate: '2026-08-25', endDate: '2026-09-01' })

    expect(res.status).toBe(200)
    const pipeline = aggregateMock.mock.calls[0][0]
    expect(pipeline[0].$match).toMatchObject({
      weekStart: { $gte: '2026-08-25', $lte: '2026-09-01' },
    })
  })

  it('omits the weekStart range when no date params are present', async () => {
    const aggregateMock = vi.fn((_pipeline: Record<string, unknown>[]) => ({ toArray: vi.fn().mockResolvedValue([]) }))
    timesheetsCollection.aggregate = aggregateMock as any

    await request(createApp())
      .get('/api/v1/reports/hours-by-project')
      .set('Authorization', 'Bearer valid-token')

    const pipeline = aggregateMock.mock.calls[0][0]
    expect((pipeline[0].$match as Record<string, unknown>).weekStart).toBeUndefined()
  })

  it('supports a single bound (startDate only)', async () => {
    const aggregateMock = vi.fn((_pipeline: Record<string, unknown>[]) => ({ toArray: vi.fn().mockResolvedValue([]) }))
    timesheetsCollection.aggregate = aggregateMock as any

    await request(createApp())
      .get('/api/v1/reports/hours-by-project')
      .set('Authorization', 'Bearer valid-token')
      .query({ startDate: '2026-08-25' })

    const pipeline = aggregateMock.mock.calls[0][0]
    expect(pipeline[0].$match).toMatchObject({ weekStart: { $gte: '2026-08-25' } })
  })

  // QA M8: hours aggregations previously counted draft/declined/withdrawn
  // timesheets as worked hours. The status filter is now applied to the match
  // stage and defaults to 'approved' on the Reports UI.
  it('applies a status filter when one is supplied', async () => {
    const aggregateMock = vi.fn((_pipeline: Record<string, unknown>[]) => ({ toArray: vi.fn().mockResolvedValue([]) }))
    timesheetsCollection.aggregate = aggregateMock as any

    await request(createApp())
      .get('/api/v1/reports/hours-by-project')
      .set('Authorization', 'Bearer valid-token')
      .query({ status: 'approved' })

    const pipeline = aggregateMock.mock.calls[0][0]
    expect(pipeline[0].$match).toMatchObject({ status: 'approved' })
  })

  it('omits the status filter when status=all or absent', async () => {
    const aggregateMock = vi.fn((_pipeline: Record<string, unknown>[]) => ({ toArray: vi.fn().mockResolvedValue([]) }))
    timesheetsCollection.aggregate = aggregateMock as any

    await request(createApp())
      .get('/api/v1/reports/hours-by-project')
      .set('Authorization', 'Bearer valid-token')
      .query({ status: 'all' })

    const pipeline = aggregateMock.mock.calls[0][0]
    expect((pipeline[0].$match as Record<string, unknown>).status).toBeUndefined()
  })
})

// QA M8: userId and department used to be mutually exclusive branches in
// buildMatchStage, so supplying both let the department branch silently
// overwrite the userId filter. They now intersect.
describe('report userId/department filter interaction', () => {
  beforeEach(() => {
    mockAdmin()
  })

  it('intersects userId and department rather than letting department overwrite userId', async () => {
    const aggregateMock = vi.fn((_pipeline: Record<string, unknown>[]) => ({ toArray: vi.fn().mockResolvedValue([]) }))
    timesheetsCollection.aggregate = aggregateMock as any

    // Pretend the department has exactly one user — the one the userId filter
    // already targets — so the intersection is non-empty and observable.
    vi.mocked(usersCollection.find).mockReturnValue({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([{ _id: new ObjectId('507f1f77bcf86cd799439012') }]) })),
      toArray: vi.fn().mockResolvedValue([{ _id: new ObjectId('507f1f77bcf86cd799439012') }]),
    } as any)

    await request(createApp())
      .get('/api/v1/reports/hours-by-project')
      .set('Authorization', 'Bearer valid-token')
      .query({ userId: '507f1f77bcf86cd799439012', department: 'Engineering' })

    const pipeline = aggregateMock.mock.calls[0][0]
    // Both conditions must be present and AND-ed; a single $in would mean
    // department overwrote userId.
    expect(pipeline[0].$match.$and).toBeDefined()
    expect(pipeline[0].$match.$and).toEqual([
      { userId: new ObjectId('507f1f77bcf86cd799439012') },
      expect.objectContaining({ userId: expect.any(Object) }),
    ])
  })

  it('returns nothing when the department has no users (empty intersection)', async () => {
    const aggregateMock = vi.fn((_pipeline: Record<string, unknown>[]) => ({ toArray: vi.fn().mockResolvedValue([]) }))
    timesheetsCollection.aggregate = aggregateMock as any

    vi.mocked(usersCollection.find).mockReturnValue({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    } as any)

    await request(createApp())
      .get('/api/v1/reports/hours-by-project')
      .set('Authorization', 'Bearer valid-token')
      .query({ department: 'Nope' })

    const pipeline = aggregateMock.mock.calls[0][0]
    // An always-false condition rather than a silent all-data return. When only
    // department is supplied and it resolves to no users, the match carries an
    // impossible userId so the aggregation matches nothing.
    expect(pipeline[0].$match).toHaveProperty('userId')
  })
})

describe('report admin gate', () => {
  it('returns 403 for non-admin users', async () => {
    setupMocks()
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: '507f1f77bcf86cd799439012', role: 'user', isSupervisor: false, exp: 9999999999 })
    vi.mocked(usersCollection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      email: 'user@example.com',
      name: 'Regular User',
      employeeId: 'EMP002',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })

    const res = await request(createApp())
      .get('/api/v1/reports/hours-by-project')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
  })
})