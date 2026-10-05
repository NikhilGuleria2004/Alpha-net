import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { readdir } from 'node:fs/promises'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}))

vi.mock('../lib/jwt', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn().mockResolvedValue({
    sub: '507f1f77bcf86cd799439011',
    role: 'hr',
    emsRole: 'hr',
  }),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}))

vi.mock('../services/activity.service', () => ({
  createActivity: vi.fn().mockResolvedValue({ id: '' }),
}))

vi.mock('../services/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: '' }),
}))

vi.mock('../lib/email', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}))

function createMockCollection() {
  const collection: any = {
    findOne: vi.fn().mockResolvedValue(null),
    findOneAndUpdate: vi.fn(),
    insertOne: vi.fn().mockImplementation(async (doc: any) => ({ insertedId: doc._id ?? new ObjectId() })),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    countDocuments: vi.fn().mockResolvedValue(0),
  }
  collection.find = vi.fn(() => makeCursor())
  collection.aggregate = vi.fn(() => makeCursor())
  return collection
}

function makeCursor(docs: any[] = []) {
  const cursor: any = {
    sort: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    skip: vi.fn(() => cursor),
    toArray: vi.fn().mockResolvedValue(docs),
  }
  cursor[Symbol.asyncIterator] = async function* () { for (const d of docs) yield d }
  return cursor
}

let usersCollection: ReturnType<typeof createMockCollection>
let documentsCollection: ReturnType<typeof createMockCollection>

beforeEach(() => {
  vi.clearAllMocks()
  usersCollection = createMockCollection()
  documentsCollection = createMockCollection()

  usersCollection.findOne.mockResolvedValue({
    _id: new ObjectId('507f1f77bcf86cd799439011'),
    name: 'HR User',
    email: 'hr@example.com',
    role: 'hr',
    emsRole: 'hr',
    status: 'active',
  })

  const db = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.DOCUMENTS) return documentsCollection
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(db as any)
})

/** Temp files multer leaves in /tmp, named by the configured filename pattern. */
async function strayUploads(): Promise<string[]> {
  const entries = await readdir('/tmp')
  return entries.filter((name) => name.startsWith('ems-doc-'))
}

const app = createApp()

/**
 * The upload route persists metadata only, so the temp file multer streams to
 * disk is pure garbage. On a platform where /tmp is capped (Vercel allows
 * 500 MB for the life of a warm instance) and outlives the request, never
 * reclaiming it means uploads eventually fail with ENOSPC.
 */
describe('POST /api/v1/documents upload temp-file lifecycle', () => {
  it('accepts an upload and reclaims the temp file on success', async () => {
    const before = await strayUploads()

    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', 'Bearer valid-token')
      .field('kind', 'contract')
      .attach('file', Buffer.from('id,amount\n1,100\n'), {
        filename: 'contract.csv',
        contentType: 'text/csv',
      })

    expect(res.status).toBe(201)

    // 'close' fires asynchronously after the response is sent.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await strayUploads()).toEqual(before)
  })

  it('reclaims the temp file when the upload is rejected', async () => {
    const before = await strayUploads()

    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', 'Bearer valid-token')
      .field('kind', 'contract')
      .attach('file', Buffer.from('binary'), {
        filename: 'payload.exe',
        contentType: 'application/x-msdownload',
      })

    // Rejected on MIME type, but multer has already written the bytes to /tmp.
    expect(res.status).toBe(400)

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await strayUploads()).toEqual(before)
  })
})
