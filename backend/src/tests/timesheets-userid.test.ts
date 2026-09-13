import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-ignore
import request from 'supertest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')

import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { createApp } from '../app.js'
import { COLLECTIONS } from '../lib/collections.js'

function timesheetDoc(ownerId: string, overrides: Record<string, any> = {}) {
  return {
    _id: new ObjectId(),
    userId: new ObjectId(ownerId),
    projectId: new ObjectId(),
    weekStart: '2026-09-07',
    entries: [],
    notes: '',
    regularHours: 0,
    overtimeHours: 0,
    totalHours: 0,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// Minimal mock DB honoring the query shapes listTimesheets uses:
// USERS.find({ supervisorId }) and TIMESHEETS.find({ userId: { $in } }).
function makeMockDb(timesheets: Record<string, any>[], users: Record<string, any>[]) {
  const findTimesheets = (query: Record<string, any>) => {
    let result = [...timesheets]
    const inIds = query?.userId?.$in?.map((id: ObjectId) => id.toString())
    if (inIds) result = result.filter((t) => inIds.includes(t.userId.toString()))
    if (query?.userId && !query.userId.$in) {
      result = result.filter((t) => t.userId.toString() === query.userId.toString())
    }
    return result
  }
  return {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.USERS) {
        return {
          find: vi.fn((query: Record<string, any> = {}) => {
            const sid = query?.supervisorId?.toString()
            const rows = sid ? users.filter((u) => u.supervisorId?.toString() === sid) : [...users]
            return { toArray: vi.fn(() => Promise.resolve(rows)) }
          }),
          findOne: vi.fn((query: Record<string, any>) =>
            Promise.resolve(users.find((u) => u._id.toString() === query._id.toString()) ?? null)
          ),
        }
      }
      if (name === COLLECTIONS.TIMESHEETS) {
        return {
          find: vi.fn((query: Record<string, any> = {}) => ({
            sort: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve(findTimesheets(query))) })),
            toArray: vi.fn(() => Promise.resolve(findTimesheets(query))),
          })),
          findOne: vi.fn(() => Promise.resolve(null)),
        }
      }
      return {
        find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([])) })), toArray: vi.fn(() => Promise.resolve([])) })),
        findOne: vi.fn(() => Promise.resolve(null)),
      }
    }),
  }
}

function authenticateAs(userId: string, role: 'admin' | 'user', isSupervisor: boolean) {
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role, isSupervisor, exp: 9999999999 } as never)
}

const adminId = new ObjectId()
const supervisorId = new ObjectId()
const subordinateId = new ObjectId()
const outsiderId = new ObjectId()
const plainUserId = new ObjectId()

const allUsers = [
  { _id: adminId, name: 'Admin', email: 'a@t.com', employeeId: 'A', department: 'Eng', role: 'admin', isSupervisor: false, status: 'active' },
  { _id: supervisorId, name: 'Sup', email: 's@t.com', employeeId: 'S', department: 'Eng', role: 'user', isSupervisor: true, status: 'active' },
  { _id: subordinateId, name: 'Sub', email: 'b@t.com', employeeId: 'B', department: 'Eng', role: 'user', isSupervisor: false, status: 'active', supervisorId },
  { _id: outsiderId, name: 'Out', email: 'o@t.com', employeeId: 'O', department: 'Eng', role: 'user', isSupervisor: false, status: 'active' },
  { _id: plainUserId, name: 'Plain', email: 'p@t.com', employeeId: 'P', department: 'Eng', role: 'user', isSupervisor: false, status: 'active' },
]

const allTimesheets = [
  timesheetDoc(supervisorId.toString()),
  timesheetDoc(subordinateId.toString()),
  timesheetDoc(outsiderId.toString()),
  timesheetDoc(plainUserId.toString()),
]

describe('GET /api/v1/timesheets userId filter (QA M3)', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(verifyAccessToken).mockReset()
    vi.mocked(getDb).mockResolvedValue(makeMockDb(allTimesheets, allUsers) as never)
  })

  it('lets an admin narrow to one user via ?userId=', async () => {
    authenticateAs(adminId.toString(), 'admin', false)
    const res = await request(createApp()).get(`/api/v1/timesheets?userId=${outsiderId}`).set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.timesheets).toHaveLength(1)
    expect(res.body.timesheets[0].userId).toBe(outsiderId.toString())
  })

  it('lets a supervisor filter to a subordinate within their scope', async () => {
    authenticateAs(supervisorId.toString(), 'user', true)
    const res = await request(createApp()).get(`/api/v1/timesheets?userId=${subordinateId}`).set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.timesheets).toHaveLength(1)
    expect(res.body.timesheets[0].userId).toBe(subordinateId.toString())
  })

  it('returns empty (not widened) when a supervisor requests someone outside their scope', async () => {
    authenticateAs(supervisorId.toString(), 'user', true)
    const res = await request(createApp()).get(`/api/v1/timesheets?userId=${outsiderId}`).set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.timesheets).toEqual([])
  })

  it('ignores ?userId= for regular users (own timesheets only)', async () => {
    authenticateAs(plainUserId.toString(), 'user', false)
    const res = await request(createApp()).get(`/api/v1/timesheets?userId=${outsiderId}`).set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.timesheets).toHaveLength(1)
    expect(res.body.timesheets[0].userId).toBe(plainUserId.toString())
  })
})