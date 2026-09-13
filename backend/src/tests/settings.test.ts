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

interface SettingsDoc {
  orgKey?: string
  userId?: string
  companyName?: string
  timezone?: string
  weeklyStartDay?: string
  workdays?: string[]
  standardWeeklyHours?: number
  weekendOvertimeEnabled?: boolean
  submissionNotifications?: boolean
  deadlineReminders?: boolean
  approvalNotifications?: boolean
  updatedAt?: Date
}

function createSettingsCollection() {
  const docs: SettingsDoc[] = []
  return {
    findOne: vi.fn((filter: any) => {
      if (filter?.orgKey) return Promise.resolve(docs.find((d) => d.orgKey === filter.orgKey) ?? null)
      if (filter?.userId) return Promise.resolve(docs.find((d) => d.userId === filter.userId) ?? null)
      return Promise.resolve(null)
    }),
    insertOne: vi.fn((doc: SettingsDoc) => { docs.push(doc); return Promise.resolve({ insertedId: new ObjectId() }) }),
    updateOne: vi.fn((filter: any, update: any) => {
      const idx = docs.findIndex((d) => d.orgKey === filter.orgKey || d.userId === filter.userId)
      if (idx >= 0) Object.assign(docs[idx], update.$set)
      else docs.push(update.$set)
      return Promise.resolve({ modifiedCount: idx >= 0 ? 1 : 0, upsertedCount: idx >= 0 ? 0 : 1 })
    }),
  }
}

function createUserCollection() {
  let userDoc: any = null
  return {
    findOne: vi.fn((filter: any) => Promise.resolve(userDoc && filter._id?.toString() === userDoc._id.toString() ? userDoc : null)),
    setUser: (doc: any) => { userDoc = doc },
  }
}

let mockDb: any
let settingsCollection: ReturnType<typeof createSettingsCollection>
let userCollection: ReturnType<typeof createUserCollection>

function setupMocks() {
  vi.mocked(getDb).mockReset()
  vi.mocked(verifyAccessToken).mockReset()
  settingsCollection = createSettingsCollection()
  userCollection = createUserCollection()
  mockDb = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.SETTINGS) return settingsCollection
      if (name === COLLECTIONS.USERS) return userCollection
      return createSettingsCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

function mockUser(userId: string, role: string, isSupervisor = false) {
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role, isSupervisor, exp: 9999999999 })
  userCollection.setUser({
    _id: new ObjectId(userId),
    email: `${userId}@example.com`,
    name: 'Test User',
    employeeId: 'EMP1',
    department: 'Eng',
    role,
    isSupervisor,
    status: 'active',
  })
}

describe('Settings (QA M4)', () => {
  beforeEach(() => setupMocks())

  it('returns default org settings when none exist', async () => {
    mockUser(new ObjectId().toString(), 'admin')
    const res = await request(createApp()).get('/api/v1/settings').set('Authorization', 'Bearer admin-token')
    expect(res.status).toBe(200)
    expect(res.body.settings.standardWeeklyHours).toBe(40)
    expect(res.body.settings.workdays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
  })

  it('rejects non-admin access to org settings with 403', async () => {
    mockUser(new ObjectId().toString(), 'user')
    const res = await request(createApp()).get('/api/v1/settings').set('Authorization', 'Bearer user-token')
    expect(res.status).toBe(403)
  })

  it('persists org settings updates (admin)', async () => {
    mockUser(new ObjectId().toString(), 'admin')
    const res = await request(createApp())
      .put('/api/v1/settings')
      .set('Authorization', 'Bearer admin-token')
      .send({ standardWeeklyHours: 35, companyName: 'Acme Corp' })
    expect(res.status).toBe(200)
    expect(res.body.settings.standardWeeklyHours).toBe(35)
    expect(res.body.settings.companyName).toBe('Acme Corp')
    expect(res.body.settings.workdays).toEqual(['mon', 'tue', 'wed', 'thu', 'fri'])
  })

  it('returns default notification prefs for a user with none saved', async () => {
    mockUser(new ObjectId().toString(), 'user')
    const res = await request(createApp()).get('/api/v1/settings/me/notification-prefs').set('Authorization', 'Bearer user-token')
    expect(res.status).toBe(200)
    expect(res.body.prefs.submissionNotifications).toBe(true)
    expect(res.body.prefs.deadlineReminders).toBe(true)
    expect(res.body.prefs.approvalNotifications).toBe(true)
  })

  it('persists per-user notification prefs', async () => {
    mockUser(new ObjectId().toString(), 'user')
    const res = await request(createApp())
      .put('/api/v1/settings/me/notification-prefs')
      .set('Authorization', 'Bearer user-token')
      .send({ deadlineReminders: false })
    expect(res.status).toBe(200)
    expect(res.body.prefs.deadlineReminders).toBe(false)
    expect(res.body.prefs.submissionNotifications).toBe(true)
  })
})