/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-ignore
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken, signAccessToken, signRefreshToken } from '../lib/jwt.js'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn<[string, string], Promise<boolean>>(),
  },
}))

function createMockCollection() {
  return {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
    find: vi.fn(() => ({ toArray: vi.fn() })),
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }
}

let mockDb: any
let usersCollection: ReturnType<typeof createMockCollection>
let sessionsCollection: ReturnType<typeof createMockCollection>

function setupAuthMocks() {
  vi.mocked(getDb).mockReset()
  vi.mocked(verifyAccessToken).mockReset()
  vi.mocked(signAccessToken).mockReset()
  vi.mocked(signRefreshToken).mockReset()
  vi.mocked(bcrypt.compare).mockReset()

  usersCollection = createMockCollection()
  sessionsCollection = createMockCollection()
  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.SESSIONS) return sessionsCollection
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => {
    setupAuthMocks()
  })

  it('returns user and access token on success', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(true as any)
    vi.mocked(signAccessToken).mockResolvedValue('mock-access-token')
    vi.mocked(signRefreshToken).mockResolvedValue('mock-refresh-token')

    vi.mocked(usersCollection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      name: 'Test User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })
    vi.mocked(usersCollection.insertOne).mockResolvedValue({ insertedId: new ObjectId('507f1f77bcf86cd799439012') })

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'password',
    })

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('test@example.com')
    expect(res.body.user.name).toBe('Test User')
    expect(res.body.accessToken).toBe('mock-access-token')
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 for invalid email', async () => {
    vi.mocked(usersCollection.findOne).mockResolvedValue(null)

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'nonexistent@example.com',
      password: 'password',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 401 for wrong password', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as any)

    vi.mocked(usersCollection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      name: 'Test User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'wrongpassword',
    })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns 401 for inactive user', async () => {
    vi.mocked(usersCollection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      name: 'Test User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'inactive',
    })

    const res = await request(createApp()).post('/api/v1/auth/login').send({
      email: 'test@example.com',
      password: 'password',
    })

    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/auth/me', () => {
  beforeEach(() => {
    setupAuthMocks()
  })

  it('returns current user with valid token', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: '507f1f77bcf86cd799439011', role: 'user', isSupervisor: false, exp: 9999999999 })

    vi.mocked(usersCollection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'test@example.com',
      name: 'Test User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })

    const res = await request(createApp())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('test@example.com')
  })

  it('returns 401 with invalid token', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue(null)

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
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: '507f1f77bcf86cd799439011', role: 'user', isSupervisor: false, exp: 9999999999 })

    vi.mocked(usersCollection.findOne).mockResolvedValue(null)

    const res = await request(createApp())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    setupAuthMocks()
  })

  it('returns 204 on logout', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: '507f1f77bcf86cd799439011', role: 'user', isSupervisor: false, exp: 9999999999 })

    vi.mocked(usersCollection.findOne).mockResolvedValue({
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      email: 'test@example.com',
      name: 'Test User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
    })

    vi.mocked(sessionsCollection.deleteOne).mockResolvedValue({ deletedCount: 1 })

    const res = await request(createApp())
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer valid-token')
      .set('Cookie', 'refreshToken=mock-refresh-token')

    expect(res.status).toBe(204)
  })
})
