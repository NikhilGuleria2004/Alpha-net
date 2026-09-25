// Flow Integration Phase 2 tests (checklist Phase 2). Mocked getDb — no live Mongo.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js', () => ({ getDb: vi.fn() }))
vi.mock('../services/auth.service.js', () => ({ hashPassword: vi.fn(async (p: string) => `hash:${p}`), revokeAllUserSessions: vi.fn() }))
vi.mock('../services/notification.service.js', () => ({ createNotification: vi.fn() }))
vi.mock('../services/activity.service.js', () => ({ createActivity: vi.fn() }))
vi.mock('../middleware/auth.js', () => ({ invalidateUserCache: vi.fn() }))

import { getDb } from '../lib/mongodb.js'
import { createUserSchema, updateUserSchema, updateMyProfileSchema } from '../schemas/user.schema.js'

function mockDbFor(collections: Record<string, any>) {
  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => collections[name] ?? collections.default),
  } as unknown as Awaited<ReturnType<typeof getDb>>)
}

function usersCollection(seed: any[] = []) {
  const items = [...seed]
  return {
    items,
    findOne: vi.fn((q: any) => {
      if (q._id) return Promise.resolve(items.find((i) => i._id.toString() === q._id.toString()) ?? null)
      return Promise.resolve(null)
    }),
    insertOne: vi.fn((doc: any) => {
      const inserted = { _id: new ObjectId(), ...doc }
      items.push(inserted)
      return Promise.resolve({ insertedId: inserted._id })
    }),
    findOneAndUpdate: vi.fn(({ _id }: any, update: any) => {
      const idx = items.findIndex((i) => i._id.toString() === _id.toString())
      if (idx === -1) return Promise.resolve(null)
      items[idx] = { ...items[idx], ...update.$set }
      return Promise.resolve(items[idx])
    }),
    find: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([...items])) })),
  }
}

const baseCreate = {
  name: 'John Smith', email: 'john@example.com', employeeId: 'E000123',
  department: 'Engineering', role: 'user', isSupervisor: false,
  status: 'active', password: 'password123',
}

describe('Phase 2 — schemas accept legacy + enrichment', () => {
  it('legacy create body (no new fields) still validates', () => {
    expect(() => createUserSchema.parse({ ...baseCreate })).not.toThrow()
  })
  it('create with full enrichment validates', () => {
    expect(() => createUserSchema.parse({
      ...baseCreate, resourceType: 'w2', hireDate: '2026-09-15',
      payType: 'hourly', defaultPayRate: 65,
      employmentStatus: 'Active', managerId: new ObjectId().toString(),
    })).not.toThrow()
  })
  it('bad resourceType / negative rate / bad payType rejected', () => {
    expect(() => createUserSchema.parse({ ...baseCreate, resourceType: 'fte' })).toThrow()
    expect(() => createUserSchema.parse({ ...baseCreate, defaultPayRate: -5 })).toThrow()
    expect(() => updateUserSchema.parse({ payType: 'equity' })).toThrow()
  })
  it('self-service updateMyProfileSchema stays restricted (no enrichment leak)', () => {
    const parsed: any = updateMyProfileSchema.parse({ name: 'X', resourceType: 'w2' } as any)
    expect(parsed).not.toHaveProperty('resourceType')
    expect(parsed).not.toHaveProperty('defaultPayRate')
    expect(parsed).not.toHaveProperty('managerId')
  })
}) // end schemas describe

describe('Phase 2 — service persists enrichment, never leaks hash', () => {
  beforeEach(() => vi.clearAllMocks())
  it('legacy create persists no new keys and leaks no passwordHash', async () => {
    const users = usersCollection([])
    mockDbFor({ users, default: users })
    const { createUser } = await import('../services/user.service.js')
    const created: any = await createUser({ ...baseCreate } as any)
    expect(created.passwordHash).toBeUndefined()
    expect(created.resourceType).toBeUndefined()
    expect(created.managerId).toBeUndefined()
    expect(users.insertOne).toHaveBeenCalledTimes(1)
    const saved = users.items[0]
    expect(saved.passwordHash).toBeDefined()
    expect(saved).not.toHaveProperty('resourceType')
    expect(saved).not.toHaveProperty('managerId')
  })
  it('create with enrichment persists + returns it', async () => {
    const users = usersCollection([])
    mockDbFor({ users, default: users })
    const { createUser } = await import('../services/user.service.js')
    const created: any = await createUser({
      ...baseCreate, resourceType: 'w2', hireDate: '2026-09-15',
      payType: 'hourly', defaultPayRate: 65, employmentStatus: 'Active',
    } as any)
    expect(created.resourceType).toBe('w2')
    expect(created.defaultPayRate).toBe(65)
    expect(created.hireDate).toBe('2026-09-15')
    expect(created.passwordHash).toBeUndefined()
  })
  it('create with managerId validates manager exists+active', async () => {
    const managerId = new ObjectId()
    const users = usersCollection([{ _id: managerId, name: 'Arun', status: 'active' }])
    mockDbFor({ users, default: users })
    const { createUser } = await import('../services/user.service.js')
    const created: any = await createUser({ ...baseCreate, managerId: managerId.toString() } as any)
    expect(created.managerId).toBe(managerId.toString())
    await expect(createUser({ ...baseCreate, email: 'x2@e.com', employeeId: 'E2', managerId: new ObjectId().toString() } as any)).rejects.toThrow('Manager not found or inactive')
  })
  it('toUser maps legacy doc without new keys (missing = undefined)', async () => {
    const id = new ObjectId()
    const users = usersCollection([{ _id: id, name: 'Jane', email: 'j@e.com', employeeId: 'E9', department: 'Eng', role: 'user', isSupervisor: false, status: 'active', supervisorId: null, createdAt: new Date(), updatedAt: new Date() }])
    mockDbFor({ users, default: users })
    const { getUserById } = await import('../services/user.service.js')
    const user: any = await getUserById(id.toString())
    expect(user.resourceType).toBeUndefined()
    expect(user.defaultPayRate).toBeUndefined()
    expect(user.managerId).toBeUndefined()
    expect(user).not.toHaveProperty('passwordHash')
  })
  it('update persists enrichment; null managerId clears', async () => {
    const id = new ObjectId()
    const mgr = new ObjectId()
    const users = usersCollection([
      { _id: id, name: 'Jane', email: 'j@e.com', employeeId: 'E9', department: 'Eng', role: 'user', isSupervisor: false, status: 'active', supervisorId: null, createdAt: new Date(), updatedAt: new Date() },
      { _id: mgr, name: 'Arun', status: 'active' },
    ])
    mockDbFor({ users, default: users })
    const { updateUser } = await import('../services/user.service.js')
    const updated: any = await updateUser(id.toString(), { resourceType: 'c2c', defaultPayRate: 80, managerId: mgr.toString() } as any)
    expect(updated.resourceType).toBe('c2c')
    expect(updated.defaultPayRate).toBe(80)
    expect(updated.managerId).toBe(mgr.toString())
    const cleared: any = await updateUser(id.toString(), { managerId: null } as any)
    expect(cleared.managerId).toBeNull()
  })
}) // end service describe
