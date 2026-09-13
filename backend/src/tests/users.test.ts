import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js', () => ({
  getDb: vi.fn(),
}))

vi.mock('../services/activity.service.js', () => ({
  createActivity: vi.fn(),
}))

import { getDb } from '../lib/mongodb.js'
import {
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  activateUser,
  getSupervisors,
  getSupervisorUsers,
} from '../services/user.service.js'

function createMockCollection(items: Record<string, unknown>[] = []) {
  let storedItems = [...items]
  return {
    find: vi.fn(() => ({
      toArray: vi.fn(() => Promise.resolve([...storedItems])),
      sort: vi.fn(() => ({
        toArray: vi.fn(() => Promise.resolve([...storedItems])),
      })),
    })),
    findOne: vi.fn(({ _id }: { _id: ObjectId }) => {
      const found = storedItems.find((item) => item._id.toString() === _id.toString())
      return Promise.resolve(found ?? null)
    }),
    findOneAndUpdate: vi.fn(({ _id }: { _id: ObjectId }, update: Record<string, unknown>) => {
      const index = storedItems.findIndex((item) => item._id.toString() === _id.toString())
      if (index === -1) return Promise.resolve(null)
      const updated = { ...storedItems[index], ...update.$set }
      storedItems[index] = updated
      return Promise.resolve(updated)
    }),
    insertOne: vi.fn((doc: Record<string, unknown>) => {
      const inserted = { _id: new ObjectId(), ...doc }
      storedItems.push(inserted)
      return Promise.resolve({ insertedId: inserted._id })
    }),
    deleteOne: vi.fn(() => {
      storedItems = []
      return Promise.resolve({ deletedCount: 1 })
    }),
    deleteMany: vi.fn(() => Promise.resolve({ deletedCount: 0 })),
    updateMany: vi.fn(() => Promise.resolve({ modifiedCount: 0 })),
  }
}

describe('user.service', () => {
  const mockDb = {
    collection: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDb).mockResolvedValue(mockDb as never)
  })

  describe('getUsers', () => {
    it('returns all users when no filters provided', async () => {
      const users = [
        { _id: new ObjectId(), name: 'User A', email: 'a@test.com', role: 'user', status: 'active' },
        { _id: new ObjectId(), name: 'User B', email: 'b@test.com', role: 'admin', status: 'active' },
      ]
      mockDb.collection.mockReturnValue(createMockCollection(users))

      const result = await getUsers()
      expect(result).toHaveLength(2)
    })

    it('filters by role when provided', async () => {
      const users = [{ _id: new ObjectId(), name: 'Admin User', role: 'admin', status: 'active' }]
      mockDb.collection.mockReturnValue(createMockCollection(users))

      const result = await getUsers({ role: 'admin' })
      expect(result).toHaveLength(1)
      expect(result[0].role).toBe('admin')
    })

    it('filters by status when provided', async () => {
      const users = [{ _id: new ObjectId(), name: 'Active User', role: 'user', status: 'active' }]
      mockDb.collection.mockReturnValue(createMockCollection(users))

      const result = await getUsers({ status: 'active' })
      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('active')
    })

    it('filters by isSupervisor when provided', async () => {
      const users = [{ _id: new ObjectId(), name: 'Supervisor', role: 'user', isSupervisor: true, status: 'active' }]
      mockDb.collection.mockReturnValue(createMockCollection(users))

      const result = await getUsers({ isSupervisor: true })
      expect(result).toHaveLength(1)
      expect(result[0].isSupervisor).toBe(true)
    })
  })

  describe('getUserById', () => {
    it('returns user when found', async () => {
      const userId = new ObjectId()
      const user = { _id: userId, name: 'Test User', email: 'test@test.com', role: 'user', status: 'active' }
      mockDb.collection.mockReturnValue(createMockCollection([user]))

      const result = await getUserById(userId.toString())
      expect(result).not.toBeNull()
      expect(result?.name).toBe('Test User')
    })

    it('returns null when user not found', async () => {
      mockDb.collection.mockReturnValue(createMockCollection([]))

      const result = await getUserById(new ObjectId().toString())
      expect(result).toBeNull()
    })
  })

  describe('updateUser', () => {
    it('updates user fields', async () => {
      const userId = new ObjectId()
      const user = { _id: userId, name: 'Old Name', email: 'old@test.com', role: 'user', status: 'active' }
      mockDb.collection.mockReturnValue(createMockCollection([user]))

      const result = await updateUser(userId.toString(), { name: 'New Name' })
      expect(result).not.toBeNull()
      expect(result?.name).toBe('New Name')
    })
  })

  describe('deactivateUser', () => {
    it('deactivates an active user', async () => {
      const userId = new ObjectId()
      const user = { _id: userId, name: 'Active User', status: 'active' }
      mockDb.collection.mockReturnValue(createMockCollection([user]))

      const result = await deactivateUser(userId.toString())
      expect(result).not.toBeNull()
      expect(result?.status).toBe('inactive')
    })
  })

  describe('activateUser', () => {
    it('activates an inactive user', async () => {
      const userId = new ObjectId()
      const user = { _id: userId, name: 'Inactive User', status: 'inactive' }
      mockDb.collection.mockReturnValue(createMockCollection([user]))

      const result = await activateUser(userId.toString())
      expect(result).not.toBeNull()
      expect(result?.status).toBe('active')
    })
  })

  describe('getSupervisors', () => {
    it('returns only supervisors', async () => {
      const supervisors = [
        { _id: new ObjectId(), name: 'Supervisor A', isSupervisor: true, role: 'user', status: 'active' },
      ]
      mockDb.collection.mockReturnValue(createMockCollection(supervisors))

      const result = await getSupervisors()
      expect(result).toHaveLength(1)
      expect(result[0].isSupervisor).toBe(true)
    })
  })

  describe('getSupervisorUsers', () => {
    it('returns users supervised by given supervisor', async () => {
      const supervisorId = new ObjectId()
      const users = [
        { _id: new ObjectId(), name: 'Team Member', supervisorId, role: 'user', status: 'active' },
      ]
      mockDb.collection.mockReturnValue(createMockCollection(users))

      const result = await getSupervisorUsers(supervisorId.toString())
      expect(result).toHaveLength(1)
    })
  })
})
