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

      expect(result.id).toBe((existingInvite._id as ObjectId).toString())
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

    it('keeps a copy of the onboarding profile on the invite itself', async () => {
      const invites = createCollectionMock()
      invites.findOne.mockResolvedValue(null)
      const users = createCollectionMock()

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
        email: 'Ada@Example.com',
        role: 'user',
        invitedBy: ADMIN_ID,
        firstName: 'Ada',
        lastName: 'Lovelace',
        employeeId: 'EMP-0042',
        department: 'Engineering',
      })

      expect(invites.insertOne).toHaveBeenCalledTimes(1)
      const invite = invites.insertOne.mock.calls[0][0] as Record<string, unknown>
      expect(invite.email).toBe('ada@example.com')
      expect(invite.firstName).toBe('Ada')
      expect(invite.lastName).toBe('Lovelace')
      expect(invite.employeeId).toBe('EMP-0042')
      expect(invite.department).toBe('Engineering')
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

  // Activation used to 400 whenever the invite's `userId` did not line up with a
  // live user row: legacy invites stored it as a string, and an invited row can
  // be deleted out from under a still-pending invite. redeemInvite now coerces
  // the id, falls back to an email match, and finally re-creates the row.
  describe('(f) redeem tolerates legacy string ids and a missing invited row', () => {
    function dbFor(opts: {
      invite: Record<string, unknown>
      users: ReturnType<typeof createCollectionMock>
      projects?: ReturnType<typeof createCollectionMock>
    }) {
      const invites = createCollectionMock([opts.invite])
      invites.findOne.mockImplementation(async (query: any) => (query.token ? opts.invite : null))
      invites.updateOne.mockResolvedValue({ modifiedCount: 1 })
      const projects = opts.projects ?? createCollectionMock()
      return {
        users: opts.users,
        projects,
        db: {
          collection: vi.fn((name: string) => {
            if (name === COLLECTIONS.INVITES) return invites
            if (name === COLLECTIONS.USERS) return opts.users
            if (name === COLLECTIONS.PROJECTS) return projects
            return createCollectionMock()
          }),
        },
      }
    }

    it('redeems when userId/projectId are legacy strings', async () => {
      const validToken = 'legacy-string-token'
      const userId = new ObjectId()
      const projectId = new ObjectId()
      const invite = inviteDoc(INVITE_ID, 'legacy@example.com', validToken)
      invite.userId = userId.toString()
      invite.projectId = projectId.toString()

      const user = userDoc('legacy@example.com', 'invited')
      user._id = userId

      const users = createCollectionMock([user])
      users.findOne.mockImplementation(async (query: any) =>
        query._id && query._id.toString() === userId.toString() ? user : null,
      )
      users.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const projects = createCollectionMock()
      projects.findOne.mockResolvedValue({ _id: projectId, name: 'Legacy' })
      projects.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const { db } = dbFor({ invite, users, projects })
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      const result = await redeemInvite({ token: validToken, password: 'Password123' })

      expect(result.user).not.toBeNull()
      expect(result.user?.email).toBe('legacy@example.com')
      expect(users.findOne.mock.calls[0][0]._id).toEqual(userId)
      expect(users.updateOne.mock.calls[0][0]).toEqual({ _id: userId })
      const [projectFilter, projectUpdate] = projects.updateOne.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
      expect(projectFilter._id).toEqual(projectId)
      expect((projectUpdate.$addToSet as Record<string, unknown>).teamMemberIds).toEqual(userId)
    })

    it('re-creates the invited row when the invite outlived its user', async () => {
      const validToken = 'orphaned-invite-token'
      const missingUserId = new ObjectId()
      const invite = inviteDoc(INVITE_ID, 'orphan@example.com', validToken)
      // Legacy string *and* dangling: the referenced row no longer exists.
      invite.userId = missingUserId.toString()

      const users = createCollectionMock([])
      users.findOne.mockResolvedValue(null)
      users.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const { db } = dbFor({ invite, users })
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      const result = await redeemInvite({ token: validToken, password: 'Password123' })

      expect(users.insertOne).toHaveBeenCalledTimes(1)
      const recreated = users.insertOne.mock.calls[0][0] as Record<string, unknown>
      // Re-uses the id the invite points at, so the reference is repaired.
      expect(recreated._id).toEqual(missingUserId)
      expect(recreated.email).toBe('orphan@example.com')
      expect(recreated.status).toBe('invited')
      expect(recreated.role).toBe('user')

      expect(result.user).not.toBeNull()
      expect(result.user?.id).toBe(missingUserId.toString())
      expect(result.user?.status).toBe('active')
      expect(result.invite).not.toBeNull()
      expect(users.updateOne.mock.calls[0][0]).toEqual({ _id: missingUserId })
    })

    it('restores the invite profile when the invited row had to be re-created', async () => {
      const validToken = 'orphaned-profile-token'
      const missingUserId = new ObjectId()
      const invite = inviteDoc(INVITE_ID, 'orphan@example.com', validToken)
      invite.userId = missingUserId.toString()
      // The profile the admin captured at invite time now lives on the invite,
      // which is all that is left once the pre-created row is gone.
      invite.firstName = 'Ada'
      invite.lastName = 'Lovelace'
      invite.employeeId = 'EMP-0042'
      invite.department = 'Engineering'

      const users = createCollectionMock([])
      users.findOne.mockResolvedValue(null)
      users.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const { db } = dbFor({ invite, users })
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      const result = await redeemInvite({ token: validToken, password: 'Password123' })

      // Never the "User <email>" placeholder: the invite's profile wins.
      expect(result.user?.name).toBe('Ada Lovelace')
      const update = users.updateOne.mock.calls[0][1] as { $set: Record<string, unknown> }
      expect(update.$set.name).toBe('Ada Lovelace')
      expect(update.$set.firstName).toBe('Ada')
      expect(update.$set.lastName).toBe('Lovelace')
      expect(update.$set.employeeId).toBe('EMP-0042')
      expect(update.$set.department).toBe('Engineering')
    })

    it('adopts an existing row matched by email instead of duplicating it', async () => {
      const validToken = 'dangling-id-token'
      const danglingId = new ObjectId()
      const invite = inviteDoc(INVITE_ID, 'moved@example.com', validToken)
      invite.userId = danglingId.toString()

      const existing = userDoc('moved@example.com', 'invited')
      const users = createCollectionMock([existing])
      users.findOne.mockImplementation(async (query: any) => {
        if (query._id) return null // the referenced id is gone
        if (query.email === 'moved@example.com') return existing
        return null
      })
      users.updateOne.mockResolvedValue({ modifiedCount: 1 })

      const { db } = dbFor({ invite, users })
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { redeemInvite } = await import('../services/invite.service.js')
      const result = await redeemInvite({ token: validToken, password: 'Password123' })

      expect(users.insertOne).not.toHaveBeenCalled()
      expect(result.user?.id).toBe((existing._id as ObjectId).toString())
      expect(users.updateOne.mock.calls[0][0]).toEqual({ _id: existing._id })
    })
  })
})
