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
vi.mock('@vercel/blob')

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
let projectsCollection: ReturnType<typeof createMockCollection>
let documentsCollection: ReturnType<typeof createMockCollection>
let sessionsCollection: ReturnType<typeof createMockCollection>

function setupMocks() {
  vi.mocked(getDb).mockReset()
  vi.mocked(verifyAccessToken).mockReset()

  usersCollection = createMockCollection()
  projectsCollection = createMockCollection()
  documentsCollection = createMockCollection()
  sessionsCollection = createMockCollection()
  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.PROJECTS) return projectsCollection
      if (name === COLLECTIONS.DOCUMENTS) return documentsCollection
      if (name === COLLECTIONS.SESSIONS) return sessionsCollection
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

function mockUser(userId: string, role: string, isSupervisor: boolean) {
  setupMocks()
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

// Regression tests for QA_REPORT.md finding C1: the documents API was mounted at
// /:projectId/documents but (a) the sub-router did not merge parent params and
// (b) requireProjectAccess/requireProjectEdit read req.params.id, so every
// documents request failed with 400 "Project ID is required".
describe('Documents route access (C1 regression)', () => {
  beforeEach(() => {
    setupMocks()
  })

  it('team member can list documents of their project', async () => {
    const userId = '507f1f77bcf86cd799439011'
    const projectId = '507f1f77bcf86cd799439012'

    mockUser(userId, 'user', false)
    vi.mocked(projectsCollection.findOne).mockResolvedValue({
      _id: new ObjectId(projectId),
      teamMemberIds: [new ObjectId(userId)],
      supervisorId: new ObjectId('507f1f77bcf86cd799439013'),
    })

    const res = await request(createApp())
      .get(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
    expect(res.body.documents).toEqual([])
  })

  it('rejects a user who is not a member of the project with 403', async () => {
    const userId = '507f1f77bcf86cd799439011'
    const projectId = '507f1f77bcf86cd799439012'

    mockUser(userId, 'user', false)
    vi.mocked(projectsCollection.findOne).mockResolvedValue({
      _id: new ObjectId(projectId),
      teamMemberIds: [],
      supervisorId: new ObjectId('507f1f77bcf86cd799439013'),
    })

    const res = await request(createApp())
      .get(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('propagates projectId into the nested /:documentId delete route', async () => {
    const userId = '507f1f77bcf86cd799439011'
    const projectId = '507f1f77bcf86cd799439012'
    const documentId = '507f1f77bcf86cd799439014'

    mockUser(userId, 'user', false)
    vi.mocked(projectsCollection.findOne).mockResolvedValue({
      _id: new ObjectId(projectId),
      teamMemberIds: [new ObjectId(userId)],
      supervisorId: new ObjectId('507f1f77bcf86cd799439013'),
    })
    // Document does not exist -> controller answers 404 (NOT the old 400 from the
    // middleware), proving both params reached the nested route.
    vi.mocked(documentsCollection.findOne).mockResolvedValue(null)

    const res = await request(createApp())
      .delete(`/api/v1/projects/${projectId}/documents/${documentId}`)
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
    expect(documentsCollection.findOne).toHaveBeenCalledWith({ _id: new ObjectId(documentId) })
  })
})