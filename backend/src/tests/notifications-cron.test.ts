import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
// @ts-ignore
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')
vi.mock('@vercel/blob')
vi.mock('../services/notification.service.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, sendDeadlineNotifications: vi.fn() }
})
import { sendDeadlineNotifications } from '../services/notification.service.js'

function createMockCollection(docs = []) {
  return {
    find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) })), toArray: vi.fn().mockResolvedValue(docs) })),
    findOne: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
  }
}

let mockDb
function setupDb(docs = {}) {
  vi.mocked(getDb).mockReset()
  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.PROJECTS) return createMockCollection(docs.projects ?? [])
      if (name === COLLECTIONS.NOTIFICATIONS) return createMockCollection(docs.notifications ?? [])
      if (name === COLLECTIONS.DOCUMENTS) return createMockCollection(docs.documents ?? [])
      return createMockCollection()
    }),
  })
}

describe('Deadline cron route (QA C3) — must be reachable with CRON_SECRET only, never behind JWT authenticate', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = 'test-cron-secret'
    setupDb()
    vi.mocked(sendDeadlineNotifications).mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('responds 200 + { sent } when called with the correct CRON_SECRET (no JWT needed)', async () => {
    vi.mocked(sendDeadlineNotifications).mockResolvedValue(7)
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/notifications/cron/deadline')
      .set('Authorization', 'Bearer test-cron-secret')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ sent: 7 })
    expect(vi.mocked(sendDeadlineNotifications)).toHaveBeenCalledTimes(1)
  })

  it('returns 401 when the Authorization header is missing', async () => {
    const app = createApp()
    const res = await request(app).post('/api/v1/notifications/cron/deadline')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 when the Authorization header is Bearer + wrong secret', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/notifications/cron/deadline')
      .set('Authorization', 'Bearer wrong-secret')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 500 when CRON_SECRET is not configured (no deployment should hit this)', async () => {
    process.env.CRON_SECRET = ''
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/notifications/cron/deadline')
      .set('Authorization', 'Bearer test-cron-secret')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('CONFIG_ERROR')
  })

  it('returns 500 when sendDeadlineNotifications throws (wrapped into INTERNAL_ERROR)', async () => {
    vi.mocked(sendDeadlineNotifications).mockRejectedValue(new Error('db down'))
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/notifications/cron/deadline')
      .set('Authorization', 'Bearer test-cron-secret')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
  })

  /**
   * Regression for the original C3: before the fix, notificationsRoutes() applied
   * router.use(authenticate) to ALL routes, so the cron route was behind JWT
   * verification. A plain CRON_SECRET Bearer would be treated as a JWT and fail
   * at verifyAccessToken → 401. Confirm the cron route is NOT behind authenticate
   * by sending a clearly-invalid JWT and checking we get the cron-specific 401
   * (Invalid cron secret), not the JWT 401 (Invalid or expired token).
   */
  it('returns the cron-specific 401 (not JWT 401) when a malformed JWT is sent', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/v1/notifications/cron/deadline')
      .set('Authorization', 'Bearer this-is-not-a-valid-jwt-or-cron-secret')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
    // The message distinguishes the cron check from JWT verify.
    expect(res.body.error.message).toContain('cron secret')
  })
})
