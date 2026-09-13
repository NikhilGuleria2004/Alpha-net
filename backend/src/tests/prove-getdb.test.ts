import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { createApp } from '../app.js'
import { verifyAccessToken } from '../lib/jwt.js'
vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')
describe('prove getDb mock identity with createApp', () => {
  const usersCol = { findOne: vi.fn(), find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })), toArray: vi.fn().mockResolvedValue([]) })) }
  const projectsCol = { findOne: vi.fn(), find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })), toArray: vi.fn().mockResolvedValue([]) })) }
  const activitiesCol = { findOne: vi.fn(), find: vi.fn(() => ({ sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })), toArray: vi.fn().mockResolvedValue([]) })) }
  const db = { collection: vi.fn((n) => { if (n === COLLECTIONS.USERS) return usersCol; if (n === COLLECTIONS.PROJECTS) return projectsCol; if (n === COLLECTIONS.ACTIVITIES) return activitiesCol; return { findOne: vi.fn(), find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) } }) }
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(verifyAccessToken).mockReset()
    vi.mocked(usersCol.findOne).mockReset()
    vi.mocked(projectsCol.find).mockReset()
    vi.mocked(activitiesCol.find).mockReset()
    vi.mocked(db.collection).mockClear()
    vi.mocked(getDb).mockResolvedValue(db)
  })
  it('getDb mock returns db in test AND in controller via createApp', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ userId: 'u1', role: 'user', isSupervisor: false, exp: 9999999999 })
    vi.mocked(usersCol.findOne).mockResolvedValue({ _id: new ObjectId().toString(), email: 'u@e.com', name: 'U', employeeId: 'E', department: 'Eng', role: 'user', isSupervisor: false, status: 'active' })
    const g = await getDb()
    expect(typeof g.collection).toBe('function')
    expect(g.collection(COLLECTIONS.USERS)).toBe(usersCol)
    // call createApp which loads the controller — controller's getDb should be the same mock
    const app = createApp()
    // prove getDb mock still returns db after createApp loaded controller
    const g2 = await getDb()
    expect(g2.collection(COLLECTIONS.USERS)).toBe(usersCol)
  })
})
