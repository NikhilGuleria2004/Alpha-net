import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import * as jwt from '../lib/jwt.js'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import crypto from 'node:crypto'

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

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}))

function createMockCollection() {
  return {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
  }
}

type MockCollection = ReturnType<typeof createMockCollection>

let mockDb: any
let usersCollection: MockCollection
let sessionsCollection: MockCollection
let invitesCollection: MockCollection
let resetsCollection: MockCollection
let activitiesCollection: MockCollection
let notificationsCollection: MockCollection

function setupDbMocks() {
  usersCollection = createMockCollection()
  sessionsCollection = createMockCollection()
  invitesCollection = createMockCollection()
  resetsCollection = createMockCollection()
  activitiesCollection = createMockCollection()
  notificationsCollection = createMockCollection()

  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.SESSIONS) return sessionsCollection
      if (name === COLLECTIONS.INVITES) return invitesCollection
      if (name === COLLECTIONS.PASSWORD_RESETS) return resetsCollection
      if (name === COLLECTIONS.ACTIVITIES) return activitiesCollection
      if (name === COLLECTIONS.NOTIFICATIONS) return notificationsCollection
      return createMockCollection()
    }),
  }

  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

function mockUser(overrides: Partial<any> = {}): any {
  return {
    _id: new ObjectId('507f1f77bcf86cd799439011'),
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

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => {
    setupDbMocks()
    vi.mocked(bcrypt.compare).mockReset()
    vi.mocked(jwt.signAccessToken).mockReset()
  })

  it('returns user and access token on success', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as any)
    vi.mocked(jwt.signAccessToken).mockResolvedValue('mock-access-token' as any)

    usersCollection.findOne.mockResolvedValue(mockUser())
    sessionsCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() })

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'password',
    })

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('test@example.com')
    expect(res.body.user.name).toBe('Test User')
    expect(res.body.accessToken).toBe('mock-access-token')
    expect(res.headers['set-cookie']).toBeDefined()
    const cookie = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'].join('; ') : String(res.headers['set-cookie'])
    expect(cookie).toContain('refreshToken=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('returns 401 for invalid email', async () => {
    usersCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'nonexistent@example.com',
      password: 'password',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 401 for wrong password', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as any)
    usersCollection.findOne.mockResolvedValue(mockUser())

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'wrongpassword',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 401 for inactive user', async () => {
    usersCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'inactive@example.com',
      password: 'password',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 400 for invalid body (missing password)', async () => {
    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'test@example.com',
    })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /api/v1/auth/me', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('returns current user with valid token', async () => {
    vi.mocked(jwt.verifyAccessToken).mockResolvedValue({
      userId: '507f1f77bcf86cd799439011',
      role: 'employee',
      isSupervisor: false,
      billable: false,
      exp: 9999999999,
    } as any)
    usersCollection.findOne.mockResolvedValue(mockUser())

    const res = await request(createApp())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('test@example.com')
    expect(res.body.user.id).toBe('507f1f77bcf86cd799439011')
  })

  it('returns 401 with invalid token', async () => {
    vi.mocked(jwt.verifyAccessToken).mockResolvedValue(null)

    const res = await request(createApp())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 with missing token', async () => {
    const res = await request(createApp()).get('/api/v1/auth/me')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 for inactive user', async () => {
    vi.mocked(jwt.verifyAccessToken).mockResolvedValue({
      userId: '507f1f77bcf86cd799439011',
      role: 'employee',
      isSupervisor: false,
      billable: false,
      exp: 9999999999,
    } as any)
    usersCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('includes role and billable in user response', async () => {
    vi.mocked(jwt.verifyAccessToken).mockResolvedValue({
      userId: '507f1f77bcf86cd799439012',
      role: 'hr',
      isSupervisor: false,
      billable: false,
      exp: 9999999999,
    } as any)
    usersCollection.findOne.mockResolvedValue(
      mockUser({ _id: new ObjectId('507f1f77bcf86cd799439012'), role: 'hr' }),
    )

    const res = await request(createApp())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBe('hr')
    expect(res.body.user.billable).toBe(false)
  })
})

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('issues a fresh access token from a valid refresh cookie', async () => {
    vi.mocked(jwt.verifyAccessToken).mockReset()

    const fakeToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(fakeToken).digest('hex')

    sessionsCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      userId: new ObjectId('507f1f77bcf86cd799439011'),
      refreshHash: tokenHash,
      expiresAt: new Date(Date.now() + 86400000),
    })

    usersCollection.findOne.mockResolvedValue(mockUser())
    sessionsCollection.findOneAndDelete.mockResolvedValue({
      value: {
        _id: new ObjectId(),
        userId: new ObjectId('507f1f77bcf86cd799439011'),
        refreshHash: tokenHash,
        expiresAt: new Date(Date.now() + 86400000),
      },
    })
    sessionsCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() })
    vi.mocked(jwt.signAccessToken).mockResolvedValue('new-access-token' as any)

    const res = await request(createApp())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', `refreshToken=${fakeToken}`)

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('new-access-token')
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 without a refresh cookie', async () => {
    const res = await request(createApp()).post('/api/v1/auth/refresh')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 for an invalid or expired refresh token', async () => {
    const fakeToken = crypto.randomBytes(32).toString('hex')

    sessionsCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', `refreshToken=${fakeToken}`)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('clears the refresh cookie on invalid token', async () => {
    const fakeToken = 'garbage-token'

    sessionsCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', `refreshToken=${fakeToken}`)

    expect(res.status).toBe(401)
    const setCookie = res.headers['set-cookie']
    const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie)
    expect(cookie).toContain('refreshToken=;')
  })

  it('rejects refresh from untrusted origin', async () => {
    const res = await request(createApp())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', 'refreshToken=some-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })
})

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('returns 204 and clears the refresh cookie', async () => {
    const fakeToken = crypto.randomBytes(32).toString('hex')

    sessionsCollection.deleteOne.mockResolvedValue({ deletedCount: 1 })

    const res = await request(createApp())
      .post('/api/v1/auth/logout')
      .set('Cookie', `refreshToken=${fakeToken}`)

    expect(res.status).toBe(204)
    expect(res.headers['set-cookie']).toBeDefined()
    const cookie = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'].join('; ') : String(res.headers['set-cookie'])
    expect(cookie).toContain('refreshToken=;')
  })

  it('returns 204 even without authentication', async () => {
    const res = await request(createApp()).post('/api/v1/auth/logout')

    expect(res.status).toBe(204)
  })
})

describe('POST /api/v1/auth/forgot-password', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('returns 200 regardless of whether the email exists', async () => {
    usersCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp()).post('/api/v1/auth/forgot-password').send({
      email: 'nonexistent@example.com',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 200 for an existing user (does not enumerate)', async () => {
    usersCollection.findOne.mockResolvedValue(mockUser())
    resetsCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() })

    const res = await request(createApp()).post('/api/v1/auth/forgot-password').send({
      email: 'test@example.com',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 400 for invalid email', async () => {
    const res = await request(createApp()).post('/api/v1/auth/forgot-password').send({
      email: 'not-an-email',
    })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/v1/auth/reset-password', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('resets password with a valid token', async () => {
    const token = 'valid-reset-token'
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    resetsCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      tokenHash,
      userId: new ObjectId('507f1f77bcf86cd799439011'),
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600000),
    })
    vi.mocked(bcrypt.hash).mockResolvedValue('new-hashed-password' as any)
    resetsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 })
    sessionsCollection.deleteMany.mockResolvedValue({ deletedCount: 1 })
    usersCollection.updateOne.mockResolvedValue({ modifiedCount: 1 })

    const res = await request(createApp()).post('/api/v1/auth/reset-password').send({
      token,
      password: 'NewPassword123',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('returns 400 for an invalid or expired token', async () => {
    resetsCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp()).post('/api/v1/auth/reset-password').send({
      token: 'expired-token',
      password: 'NewPassword123',
    })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_TOKEN')
  })

  it('returns 400 for weak password', async () => {
    const res = await request(createApp()).post('/api/v1/auth/reset-password').send({
      token: 'some-token',
      password: 'weak',
    })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/v1/auth/redeem-invite', () => {
  beforeEach(() => {
    setupDbMocks()
  })

  it('activates user and returns tokens on valid invite', async () => {
    const inviteToken = 'valid-invite-token'
    const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex')

    invitesCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      email: 'newhire@example.com',
      tokenHash,
      role: 'employee',
      billable: true,
      payRate: 50,
      currency: 'USD',
      firstName: 'New',
      lastName: 'Hire',
      employeeId: 'E000200',
      department: 'Engineering',
      expiresAt: new Date(Date.now() + 7 * 86400000),
      redeemedAt: null,
    })
    usersCollection.findOne.mockResolvedValue(null)
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed-new-password' as any)
    usersCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId('507f1f77bcf86cd799439013') })
    invitesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 })
    sessionsCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() })
    activitiesCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() })
    notificationsCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() })
    vi.mocked(jwt.signAccessToken).mockResolvedValue('mock-access-token' as any)

    const res = await request(createApp())
      .post('/api/v1/auth/redeem-invite')
      .set('Origin', 'http://localhost:5173')
      .send({
        token: inviteToken,
        password: 'Password123',
      })

    expect(res.status).toBe(200)
    expect(res.body.user).toBeDefined()
    expect(res.body.user.email).toBe('newhire@example.com')
    expect(res.body.user.status).toBe('active')
    expect(res.body.accessToken).toBe('mock-access-token')
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('rejects an invalid or expired invite token', async () => {
    invitesCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp())
      .post('/api/v1/auth/redeem-invite')
      .set('Origin', 'http://localhost:5173')
      .send({
        token: 'expired-token',
        password: 'Password123',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVITE_INVALID')
  })

  it('rejects billable invite without pay rate', async () => {
    const inviteToken = 'billable-invite-no-rate'
    const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex')

    invitesCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      email: 'billable@example.com',
      tokenHash,
      role: 'employee',
      billable: true,
      payRate: 0,
      currency: 'USD',
      expiresAt: new Date(Date.now() + 7 * 86400000),
      redeemedAt: null,
    })

    const res = await request(createApp())
      .post('/api/v1/auth/redeem-invite')
      .set('Origin', 'http://localhost:5173')
      .send({
        token: inviteToken,
        password: 'Password123',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BILLABLE_WITHOUT_RATE')
  })

  it('rejects already-redeemed invite', async () => {
    invitesCollection.findOne.mockResolvedValue(null)

    const res = await request(createApp())
      .post('/api/v1/auth/redeem-invite')
      .set('Origin', 'http://localhost:5173')
      .send({
        token: 'old-token',
        password: 'Password123',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVITE_INVALID')
  })

  it('rejects weak password on redeem', async () => {
    const res = await request(createApp())
      .post('/api/v1/auth/redeem-invite')
      .set('Origin', 'http://localhost:5173')
      .send({
        token: 'some-token',
        password: 'weak',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await request(createApp()).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})

describe('Unknown routes', () => {
  it('returns 404 NOT_FOUND', async () => {
    const res = await request(createApp()).get('/api/v1/nonexistent')

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

/**
 * The refresh cookie is the whole auth session, so its SameSite attribute
 * decides whether a deployed SPA can stay logged in at all. `lax` works when
 * the SPA and API share a site; a cross-site split needs `none`, which browsers
 * only accept together with `Secure`.
 */
describe('refresh cookie topology', () => {
  const savedSameSite = process.env.COOKIE_SAME_SITE
  const savedNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    setupDbMocks()
    vi.mocked(bcrypt.compare).mockReset()
    vi.mocked(jwt.signAccessToken).mockReset()
  })

  afterEach(() => {
    if (savedSameSite === undefined) delete process.env.COOKIE_SAME_SITE
    else process.env.COOKIE_SAME_SITE = savedSameSite
    process.env.NODE_ENV = savedNodeEnv
  })

  async function loginCookieHeader(): Promise<string> {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as any)
    vi.mocked(jwt.signAccessToken).mockResolvedValue('mock-access-token' as any)
    usersCollection.findOne.mockResolvedValue(mockUser())
    sessionsCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() })

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'password',
    })
    expect(res.status).toBe(200)
    const raw = res.headers['set-cookie']
    return Array.isArray(raw) ? raw.join('; ') : String(raw)
  }

  it('defaults to SameSite=Lax for a same-site SPA and API', async () => {
    delete process.env.COOKIE_SAME_SITE
    expect(await loginCookieHeader()).toContain('SameSite=Lax')
  })

  it('honours COOKIE_SAME_SITE=none for a cross-site split', async () => {
    process.env.COOKIE_SAME_SITE = 'none'
    expect(await loginCookieHeader()).toContain('SameSite=None')
  })

  it('forces Secure alongside SameSite=None even outside production', async () => {
    // Browsers drop a SameSite=None cookie that is not also Secure, so the
    // attribute must not depend on NODE_ENV the way `secure` used to.
    process.env.COOKIE_SAME_SITE = 'none'
    process.env.NODE_ENV = 'development'
    const cookie = await loginCookieHeader()
    expect(cookie).toContain('SameSite=None')
    expect(cookie).toContain('Secure')
  })

  it('falls back to Lax for an unrecognised COOKIE_SAME_SITE value', async () => {
    process.env.COOKIE_SAME_SITE = 'nonsense'
    expect(await loginCookieHeader()).toContain('SameSite=Lax')
  })
})
