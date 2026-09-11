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
    find: vi.fn((_query?: unknown) => ({ sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }
}

let mockDb: any
let usersCollection: ReturnType<typeof createMockCollection>
let notificationsCollection: ReturnType<typeof createMockCollection>

const USER_A = '507f1f77bcf86cd799439011'
const USER_B = '507f1f77bcf86cd799439012'

function setupMocks(userId: string) {
  vi.mocked(getDb).mockReset()
  vi.mocked(verifyAccessToken).mockReset()

  usersCollection = createMockCollection()
  notificationsCollection = createMockCollection()
  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.NOTIFICATIONS) return notificationsCollection
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role: 'user', isSupervisor: false, exp: 9999999999 })
  vi.mocked(usersCollection.findOne).mockResolvedValue({
    _id: new ObjectId(userId),
    email: `user${userId}@example.com`,
    name: `User ${userId}`,
    employeeId: `EMP${userId}`,
    department: 'Engineering',
    role: 'user',
    isSupervisor: false,
    status: 'active',
  })
}

// S1 regression (QA_REPORT.md): POST /notifications/:id/read must only mutate the
// caller's own notification — otherwise any authenticated user could mark
// another user's notifications (IDOR).
describe('POST /api/v1/notifications/:id/read', () => {
  beforeEach(() => {
    setupMocks(USER_A)
  })

  it('marks the caller’s own notification as read', async () => {
    notificationsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 })

    const res = await request(createApp())
      .post('/api/v1/notifications/507f1f77bcf86cd7994390ab/read')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // The update must be constrained by BOTH id and the caller's userId.
    const [filter] = notificationsCollection.updateOne.mock.calls[0]
    expect(filter).toMatchObject({
      _id: new ObjectId('507f1f77bcf86cd7994390ab'),
      userId: new ObjectId(USER_A),
    })
  })

  it('does not mark another user’s notification (IDOR blocked) — returns 404', async () => {
    // modifiedCount 0 simulates the ownership query matching nothing
    // (the notification exists but belongs to someone else).
    notificationsCollection.updateOne.mockResolvedValue({ modifiedCount: 0 })

    const res = await request(createApp())
      .post('/api/v1/notifications/507f1f77bcf86cd7994390ab/read')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 401 without a valid access token', async () => {
    const res = await request(createApp()).post('/api/v1/notifications/507f1f77bcf86cd7994390ab/read')
    expect(res.status).toBe(401)
  })
})

// S2 regression (QA_REPORT.md): POST /notifications accepted caller-supplied
// userId with no authorization — any user could forge notifications for anyone.
// The endpoint is removed entirely; all notifications are created server-side
// by services tied to real business events.
describe('POST /api/v1/notifications (S2 regression)', () => {
  it('no longer exists — forging notifications is impossible', async () => {
    setupMocks(USER_A)
    const res = await request(createApp())
      .post('/api/v1/notifications')
      .set('Authorization', 'Bearer valid-token')
      .send({ userId: USER_B, type: 'approval', title: 'forged', message: 'forged' })

    expect(res.status).toBe(404)
  })
})

// The list + mark-all endpoints are already scoped by userId server-side; these
// lock that behavior so it doesn't regress.
describe('GET /api/v1/notifications', () => {
  beforeEach(() => {
    setupMocks(USER_A)
  })

  it('returns only the caller’s notifications', async () => {
    const res = await request(createApp())
      .get('/api/v1/notifications')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    const findQuery = notificationsCollection.find.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(findQuery.userId).toEqual(new ObjectId(USER_A))
  })
})