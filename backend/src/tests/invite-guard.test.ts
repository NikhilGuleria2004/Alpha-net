/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { getDb } from '../lib/mongodb.js'

vi.mock('../lib/mongodb.js')
vi.mock('../services/activity.service.js', () => ({
  createActivity: vi.fn(),
}))
vi.mock('../services/notification.service.js', () => ({
  createNotification: vi.fn(),
}))

function createCollectionMock(items: Record<string, unknown>[] = []) {
  let stored = [...items]
  return {
    find: vi.fn(() => ({
      toArray: vi.fn(() => Promise.resolve([...stored])),
      sort: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([...stored])) })),
    })),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    insertOne: vi.fn((doc: Record<string, unknown>) => {
      const inserted = { _id: new ObjectId(), ...doc }
      stored.push(inserted)
      return Promise.resolve({ insertedId: inserted._id })
    }),
    deleteOne: vi.fn(() => Promise.resolve({ deletedCount: 1 })),
    updateOne: vi.fn(),
  }
}

const ADMIN_ID = '507f1f77bcf86cd799439011'
const INVITE_ID = '507f1f77bcf86cd799439055'

function inviteDoc(id: string, email: string, token: string, acceptedAt: Date | null = null, expiresAt?: Date): Record<string, unknown> {
  const now = new Date()
  return {
    _id: new ObjectId(id),
    email,
    role: 'user',
    token,
    invitedBy: new ObjectId(ADMIN_ID),
    userId: new ObjectId(),
    createdAt: new Date(now.getTime() - 86400000),
    expiresAt: expiresAt ?? new Date(now.getTime() + 7 * 86400000),
    acceptedAt,
  }
}

function userDoc(email: string, status: string = 'invited'): Record<string, unknown> {
  return {
    _id: new ObjectId(),
    name: '',
    email,
    employeeId: '',
    department: '',
    role: 'user',
    isSupervisor: false,
    status,
    supervisorId: null,
    passwordHash: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('invite guard tests', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  describe('(c) duplicate-email invite is idempotent', () => {
    it('returns existing pending invite when inviting same email again', async () => {
      const existingInvite = inviteDoc(INVITE_ID, 'user@example.com', 'token-abc123')
      const existingUser = userDoc('user@example.com', 'invited')
      const invites = createCollectionMock([existingInvite])
      const users = createCollectionMock([existingUser])

      invites.findOne.mockImplementation(async (query: any) => {
        if (query.email) return existingInvite
        return null
      })

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.INVITES) return invites
          if (name === COLLECTIONS.USERS) return users
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { createInvite } = await import('../services/invite.service.js')
      const result = await createInvite({
        email: 'user@example.com',
        role: 'user',
        invitedBy: ADMIN_ID,
      })

      expect((result as Record<string, unknown>).id).toBe(existingInvite._id.toString())
      expect(result.email).toBe('user@example.com')
      expect(users.insertOne).not.toHaveBeenCalled()
    })

    it('creates new invite when no pending invite exists', async () => {
      const users = createCollectionMock()
      const invites = createCollectionMock()
      invites.findOne.mockResolvedValue(null)

      const counters = createCollectionMock()

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.INVITES) return invites
          if (name === COLLECTIONS.USERS) return users
          if (name === COLLECTIONS.INVOICE_COUNTERS) return counters
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { createInvite } = await import('../services/invite.service.js')
      const result = await createInvite({
        email: 'newuser@example.com',
        role: 'supervisor',
        invitedBy: ADMIN_ID,
      })

      expect(result.email).toBe('newuser@example.com')
      expect(users.insertOne).toHaveBeenCalledTimes(1)
    })
  })

  describe('(d) expired-token redeem rejected', () => {
    it('rejects redeem with expired token', async () => {
      const expiredToken = 'expired-token-123'
      const expiredInvite = inviteDoc(
        INVITE_ID,
        'expired@example.com',
        expiredToken,
        null,
        new Date(Date.now() - 86400000),
      )
      const invites = createCollectionMock([expiredInvite])
      invites.findOne.mockImplementation(async (query: any) => {
        if (query.token) return expiredInvite
        return null
      })

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.INVITES) return invites
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      const result = await redeemInvite({ token: expiredToken, password: 'Password123' })

      expect(result.user).toBeNull()
      expect(result.invite).toBeNull()
    })

    it('rejects redeem with non-existent token', async () => {
      const invites = createCollectionMock()
      invites.findOne.mockResolvedValue(null)

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.INVITES) return invites
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      const result = await redeemInvite({ token: 'nonexistent-token', password: 'Password123' })

      expect(result.user).toBeNull()
      expect(result.invite).toBeNull()
    })

    it('accepts redeem with valid unexpired token', async () => {
      const validToken = 'valid-token-456'
      const userId = new ObjectId()
      const invite = inviteDoc(INVITE_ID, 'valid@example.com', validToken)
      invite.userId = userId

      const user = userDoc('valid@example.com', 'invited')
      user._id = userId

      const invites = createCollectionMock([{ ...invite }])
      invites.findOne.mockImplementation(async (query: any) => {
        if (query.token) return invite
        if (query._id) {
          const u = await invites.findOne(query)
          return u
        }
        return null
      })

      const users = createCollectionMock([user])
      users.findOne.mockImplementation(async (query: any) => {
        if (query._id && query._id.toString() === userId.toString()) return user
        return null
      })

      const updatedInvite = { ...invite, acceptedAt: new Date() }
      invites.findOneAndUpdate.mockResolvedValue(updatedInvite)
      users.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.INVITES) return invites
          if (name === COLLECTIONS.USERS) return users
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      const result = await redeemInvite({ token: validToken, password: 'Password123' })

      expect(result.user).not.toBeNull()
      expect(result.user?.email).toBe('valid@example.com')
      expect(result.invite).not.toBeNull()
    })
  })

  describe('(e) full onboarding profile', () => {
    it('stores the composed name, employee ID, department and role on the invited user', async () => {
      const users = createCollectionMock()
      const invites = createCollectionMock()
      invites.findOne.mockResolvedValue(null)

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.INVITES) return invites
          if (name === COLLECTIONS.USERS) return users
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { createInvite } = await import('../services/invite.service.js')
      await createInvite({
        email: 'ada@example.com',
        role: 'supervisor',
        invitedBy: ADMIN_ID,
        firstName: 'Ada',
        lastName: 'Lovelace',
        employeeId: 'EMP-0042',
        department: 'Engineering',
      })

      expect(users.insertOne).toHaveBeenCalledTimes(1)
      const userDoc = users.insertOne.mock.calls[0][0] as Record<string, unknown>
      expect(userDoc.name).toBe('Ada Lovelace')
      expect(userDoc.firstName).toBe('Ada')
      expect(userDoc.lastName).toBe('Lovelace')
      expect(userDoc.employeeId).toBe('EMP-0042')
      expect(userDoc.department).toBe('Engineering')
      expect(userDoc.role).toBe('user')
      expect(userDoc.isSupervisor).toBe(true)
      expect(userDoc.status).toBe('invited')
    })

    it('applies profile enrichment and composes the name on redeem', async () => {
      const validToken = 'valid-token-789'
      const userId = new ObjectId()
      const invite = inviteDoc(INVITE_ID, 'grace@example.com', validToken)
      invite.userId = userId

      const user = userDoc('grace@example.com', 'invited')
      user._id = userId

      const invites = createCollectionMock([invite])
      invites.findOne.mockImplementation(async (query: any) => {
        if (query.token) return invite
        return null
      })
      const users = createCollectionMock([user])
      users.findOne.mockResolvedValue(user)
      users.updateOne.mockResolvedValue({ modifiedCount: 1 })
      const projects = createCollectionMock()
      projects.findOne.mockResolvedValue(null)

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.INVITES) return invites
          if (name === COLLECTIONS.USERS) return users
          if (name === COLLECTIONS.PROJECTS) return projects
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      const result = await redeemInvite({
        token: validToken,
        password: 'Password123',
        firstName: 'Grace',
        lastName: 'Hopper',
        employeeId: 'EMP-0007',
        department: 'QA',
      })

      expect(result.user).not.toBeNull()
      expect(result.user?.name).toBe('Grace Hopper')
      const update = users.updateOne.mock.calls[0][1] as { $set: Record<string, unknown> }
      expect(update.$set.name).toBe('Grace Hopper')
      expect(update.$set.firstName).toBe('Grace')
      expect(update.$set.lastName).toBe('Hopper')
      expect(update.$set.employeeId).toBe('EMP-0007')
      expect(update.$set.department).toBe('QA')
      expect(update.$set.status).toBe('active')
    })

    it('adds the invitee to the invited project team on redeem', async () => {
      const validToken = 'valid-token-with-project'
      const userId = new ObjectId()
      const projectId = new ObjectId()
      const invite = inviteDoc(INVITE_ID, 'team@example.com', validToken)
      invite.userId = userId
      invite.projectId = projectId

      const user = userDoc('team@example.com', 'invited')
      user._id = userId
      user.firstName = 'Alan'
      user.lastName = 'Turing'
      user.name = 'Alan Turing'

      const invites = createCollectionMock([invite])
      invites.findOne.mockImplementation(async (query: any) => {
        if (query.token) return invite
        return null
      })
      const users = createCollectionMock([user])
      users.findOne.mockResolvedValue(user)
      users.updateOne.mockResolvedValue({ modifiedCount: 1 })
      const projects = createCollectionMock()
      projects.findOne.mockResolvedValue({ _id: projectId, name: 'Apollo' })
      projects.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.INVITES) return invites
          if (name === COLLECTIONS.USERS) return users
          if (name === COLLECTIONS.PROJECTS) return projects
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      await redeemInvite({ token: validToken, password: 'Password123' })

      expect(projects.updateOne).toHaveBeenCalledTimes(1)
      const [filter, update] = projects.updateOne.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
      expect(filter._id).toEqual(projectId)
      expect((update.$addToSet as Record<string, unknown>).teamMemberIds).toEqual(userId)
    })
  })
})
