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

// Minimal mock respecting only the query shapes listUsers / authenticate use:
// { _id } findOne, { supervisorId } find, { _id: { $in } } find, {} find.
function makeMockDb(users: Record<string, any>[], projects: Record<string, any>[]) {
  const findUsers = (query: Record<string, any>) => {
    let result = [...users]
    if (query?.supervisorId) {
      const sid = query.supervisorId.toString()
      result = result.filter((u) => u.supervisorId?.toString() === sid)
    }
    if (query?._id?.$in) {
      const inSet = new Set(query._id.$in.map((id: ObjectId) => id.toString()))
      result = result.filter((u) => inSet.has(u._id.toString()))
    }
    return Promise.resolve(result)
  }
  return {
    collection: vi.fn((name: string) => ({
      find: vi.fn((query: Record<string, any> = {}) => ({
        toArray: vi.fn(() =>
          name === COLLECTIONS.PROJECTS ? Promise.resolve([...projects]) : findUsers(query)
        ),
        sort: vi.fn(() => ({
          toArray: vi.fn(() =>
            name === COLLECTIONS.PROJECTS ? Promise.resolve([...projects]) : findUsers(query)
          ),
        })),
      })),
      findOne: vi.fn((query: Record<string, any>) =>
        Promise.resolve(users.find((u) => u._id.toString() === query._id.toString()) ?? null)
      ),
    })),
  }
}

const requesterId = new ObjectId()
const mateId = new ObjectId()
const supervisorId = new ObjectId()
const managerId = new ObjectId()
const strangerId = new ObjectId()

const directoryUsers = [
  { _id: requesterId, name: 'Requester', email: 'r@test.com', employeeId: 'EMP-R', department: 'Eng', role: 'user', isSupervisor: false, status: 'active', supervisorId: supervisorId },
  { _id: mateId, name: 'Teammate', email: 'm@test.com', employeeId: 'EMP-M', department: 'Eng', role: 'user', isSupervisor: false, status: 'active' },
  { _id: supervisorId, name: 'Supervisor', email: 's@test.com', employeeId: 'EMP-S', department: 'Eng', role: 'user', isSupervisor: true, status: 'active' },
  { _id: managerId, name: 'Manager', email: 'mg@test.com', employeeId: 'EMP-G', department: 'Eng', role: 'user', isSupervisor: false, status: 'active' },
  { _id: strangerId, name: 'Stranger', email: 'x@test.com', employeeId: 'EMP-X', department: 'Legal', role: 'user', isSupervisor: false, status: 'active' },
]

const projects = [
  {
    _id: new ObjectId(),
    name: 'P1',
    teamMemberIds: [requesterId, mateId],
    supervisorId,
    managerId,
  },
]

function authenticateAs(userId: ObjectId, role: 'admin' | 'user', isSupervisor: boolean) {
  vi.mocked(verifyAccessToken).mockResolvedValue({
    userId: userId.toString(),
    role,
    isSupervisor,
    exp: 9999999999,
  } as never)
}

describe('GET /api/v1/users (QA C1 — scoped directory)', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(verifyAccessToken).mockReset()
    vi.mocked(getDb).mockResolvedValue(makeMockDb(directoryUsers, projects) as never)
  })

  it('returns 200 (not 403) for a non-admin and only scoped users', async () => {
    authenticateAs(requesterId, 'user', false)

    const res = await request(createApp()).get('/api/v1/users').set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    const ids = res.body.users.map((u: { id: string }) => u.id).sort()
    // self, teammate, project supervisor, project manager, own supervisor — but no stranger
    expect(ids).toEqual([mateId.toString(), managerId.toString(), supervisorId.toString(), requesterId.toString()].sort())
    // directory projection must not leak sensitive fields of others
    for (const u of res.body.users) {
      expect(u.email).toBeUndefined()
      expect(u.employeeId).toBeUndefined()
    }
  })

  it('includes subordinates for a supervisor requester', async () => {
    authenticateAs(requesterId, 'user', true)

    // Give the requester a subordinate via the users store
    const subordinateId = new ObjectId()
    vi.mocked(getDb).mockResolvedValue(
      makeMockDb(
        [...directoryUsers, { _id: subordinateId, name: 'Sub', email: 'sub@test.com', employeeId: 'EMP-B', department: 'Eng', role: 'user', isSupervisor: false, status: 'active', supervisorId: requesterId }],
        projects
      ) as never
    )

    const res = await request(createApp()).get('/api/v1/users').set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    const ids = res.body.users.map((u: { id: string }) => u.id)
    expect(ids).toContain(subordinateId.toString())
  })

  it('returns the full user list for an admin', async () => {
    // Use a distinct admin userId — the auth middleware caches users by id for
    // 60s in-process, so reusing requesterId would serve the earlier non-admin
    // cache entry.
    const adminId = new ObjectId()
    authenticateAs(adminId, 'admin', false)
    // The role is resolved from the DB (not just the token), so the requester's
    // stored document must be an admin for the admin branch to run.
    vi.mocked(getDb).mockResolvedValue(
      makeMockDb(
        [
          ...directoryUsers,
          { _id: adminId, name: 'Admin', email: 'a@test.com', employeeId: 'EMP-A', department: 'Eng', role: 'admin', isSupervisor: false, status: 'active' },
        ],
        projects
      ) as never
    )

    const res = await request(createApp()).get('/api/v1/users').set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    // Admin branch uses the user service over the same mock db → all users,
    // including the stranger.
    expect(res.body.users).toHaveLength(directoryUsers.length + 1)
  })
})
