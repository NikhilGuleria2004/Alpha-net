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
// Isolate side effects so tests only assert on the create-user contract.
vi.mock('../services/activity.service.js')
vi.mock('../services/notification.service.js')

function createMockCollection() {
  return {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      toArray: vi.fn().mockResolvedValue([]),
    })),
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }
}

let mockDb: any
let usersCollection: ReturnType<typeof createMockCollection>

const ADMIN_ID = '507f1f77bcf86cd799439011'
const NEW_USER_ID = '507f1f77bcf86cd799439099'
const TARGET_USER_ID = '507f1f77bcf86cd799439012'

function setupMocks() {
  vi.mocked(getDb).mockReset()
  vi.mocked(verifyAccessToken).mockReset()

  usersCollection = createMockCollection()
  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return usersCollection
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

function mockAdmin() {
  setupMocks()
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId: ADMIN_ID, role: 'admin', isSupervisor: false, exp: 9999999999 })
  // authenticate looks the requester up by _id; the create controller looks up
  // conflicts by email/employeeId. Distinguish by query shape.
  usersCollection.findOne.mockImplementation((query: any) => {
    if (query.email !== undefined || query.employeeId !== undefined) {
      return Promise.resolve(null) // no email / employeeId conflicts
    }
    return Promise.resolve({
      _id: new ObjectId(ADMIN_ID),
      email: 'admin@example.com',
      name: 'Admin User',
      employeeId: 'EMP001',
      department: 'Engineering',
      role: 'admin',
      isSupervisor: false,
      status: 'active',
      supervisorId: null,
    })
  })
}

const validPayload = {
  name: 'New User',
  email: 'new.user@example.com',
  employeeId: 'EMP100',
  department: 'Engineering',
  role: 'user',
  isSupervisor: false,
  status: 'active',
  password: 'Secret123',
}

// Regression tests for QA_REPORT.md finding C2: the admin Create User UI sent
// no password while createUserSchema requires one, so every submit failed with
// 400 "Password is required".
describe('Create user password contract (C2 regression)', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('admin can create a user — password is hashed and never returned', async () => {
    mockAdmin()

    let capturedDoc: any
    usersCollection.insertOne.mockImplementation(async (doc: any) => {
      capturedDoc = doc
      return { insertedId: new ObjectId(NEW_USER_ID) }
    })

    const res = await request(createApp())
      .post('/api/v1/users/')
      .set('Authorization', 'Bearer valid-token')
      .send(validPayload)

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe('new.user@example.com')
    // Stored document: hashed, plaintext never persisted.
    expect(capturedDoc.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(capturedDoc.password).toBeUndefined()
    // Response: the bcrypt hash must not leak to the client.
    expect(res.body.user.passwordHash).toBeUndefined()
    expect(res.body.user.password).toBeUndefined()
  })

  it('rejects creation without a password', async () => {
    mockAdmin()
    const { password, ...withoutPassword } = validPayload

    const res = await request(createApp())
      .post('/api/v1/users/')
      .set('Authorization', 'Bearer valid-token')
      .send(withoutPassword)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    // zod reports a missing required field with message "Required"
    expect(res.body.error.message).toContain('Required')
  })

  it('rejects creation with a password shorter than 8 characters', async () => {
    mockAdmin()

    const res = await request(createApp())
      .post('/api/v1/users/')
      .set('Authorization', 'Bearer valid-token')
      .send({ ...validPayload, password: 'abc' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.message).toContain('8')
  })

  it('admin can rotate a password via PATCH — hashed, never returned', async () => {
    mockAdmin()
    // authenticate resolves the admin by _id; updateUser resolves the target
    // by _id — both take the non-email branch of the mock above.
    usersCollection.findOneAndUpdate.mockResolvedValue({
      _id: new ObjectId(TARGET_USER_ID),
      email: 'target@example.com',
      name: 'Target User',
      employeeId: 'EMP002',
      department: 'Engineering',
      role: 'user',
      isSupervisor: false,
      status: 'active',
      supervisorId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const res = await request(createApp())
      .patch(`/api/v1/users/${TARGET_USER_ID}`)
      .set('Authorization', 'Bearer valid-token')
      .send({ password: 'Newsecret456' })

    expect(res.status).toBe(200)
    const updateArg = usersCollection.findOneAndUpdate.mock.calls[0][1]
    expect(updateArg.$set.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(updateArg.$set.password).toBeUndefined()
    expect(res.body.user.passwordHash).toBeUndefined()
  })
})