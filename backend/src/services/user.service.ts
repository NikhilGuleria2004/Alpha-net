import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { hashPassword, revokeAllUserSessions } from './auth.service.js'
import { ObjectId } from 'mongodb'
import { createNotification } from './notification.service.js'
import { createActivity } from './activity.service.js'
import { invalidateUserCache } from '../middleware/auth.js'
import { escapeRegex } from '../lib/regex.js'

export interface User {
  id: string
  name: string
  firstName?: string
  lastName?: string
  email: string
  employeeId: string
  department: string
  role: 'admin' | 'user'
  isSupervisor: boolean
  status: 'active' | 'inactive' | 'invited'
  supervisorId?: string | null
  // Flow Integration Phase 2: optional Resource enrichment (docx §2/§9).
  // Undefined for legacy users; readers must treat missing as 'unknown'/unset.
  resourceType?: 'w2' | 'c2c' | 'offshore' | 'unknown'
  hireDate?: string
  payType?: 'hourly' | 'salary' | 'contract'
  defaultPayRate?: number
  employmentStatus?: string
  managerId?: string | null
  createdAt: Date
  updatedAt: Date
}

export type ResourceType = 'w2' | 'c2c' | 'offshore' | 'unknown'

export interface CreateUserInput {
  /** Optional when firstName + lastName are provided — the display name is composed. */
  name?: string
  firstName?: string
  lastName?: string
  email: string
  employeeId: string
  department: string
  role: 'admin' | 'user'
  isSupervisor: boolean
  status: 'active' | 'inactive' | 'invited'
  supervisorId?: string | null
  password: string
  // Flow Integration Phase 2: all optional, validated only when supplied.
  resourceType?: ResourceType
  hireDate?: string
  payType?: 'hourly' | 'salary' | 'contract'
  defaultPayRate?: number
  employmentStatus?: string
  managerId?: string | null
}

export interface UpdateUserInput {
  name?: string
  firstName?: string
  lastName?: string
  email?: string
  employeeId?: string
  department?: string
  role?: 'admin' | 'user'
  isSupervisor?: boolean
  status?: 'active' | 'inactive' | 'invited'
  supervisorId?: string | null
  password?: string
  // Flow Integration Phase 2: all optional.
  resourceType?: ResourceType
  hireDate?: string
  payType?: 'hourly' | 'salary' | 'contract'
  defaultPayRate?: number
  employmentStatus?: string
  managerId?: string | null
}

/** Display name composed from the profile parts (falls back to existing values). */
function composeName(firstName?: string | null, lastName?: string | null, fallback?: string | null): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ') || fallback?.trim() || ''
}

/** Shared field mapping for user documents → API shape (never leaks the hash). */
function toUser(doc: Record<string, any>): User {
  return {
    id: doc._id.toString(),
    name: doc.name,
    firstName: doc.firstName ?? undefined,
    lastName: doc.lastName ?? undefined,
    email: doc.email,
    employeeId: doc.employeeId,
    department: doc.department,
    role: doc.role,
    isSupervisor: doc.isSupervisor,
    status: doc.status,
    supervisorId: doc.supervisorId?.toString(),
    // Flow Integration Phase 2: passthrough (?? undefined keeps legacy shape
    // key-absent when unset, so old clients see no change).
    resourceType: doc.resourceType ?? undefined,
    hireDate: doc.hireDate ?? undefined,
    payType: doc.payType ?? undefined,
    defaultPayRate: doc.defaultPayRate ?? undefined,
    employmentStatus: doc.employmentStatus ?? undefined,
    managerId: doc.managerId?.toString() ?? (doc.managerId === null ? null : undefined),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export async function getUsers(filters?: { role?: string; status?: string; isSupervisor?: boolean; supervisorId?: string; search?: string }): Promise<User[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (filters?.role) query.role = filters.role
  if (filters?.status) query.status = filters.status
  if (filters?.isSupervisor !== undefined) query.isSupervisor = filters.isSupervisor
  if (filters?.supervisorId) query.supervisorId = new ObjectId(filters.supervisorId)
  if (filters?.search) {
    // QA M15: escape metacharacters so the search is a literal substring
    // match instead of a regex the user can control.
    const escaped = escapeRegex(filters.search)
    query.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ]
  }

  const users = await db.collection(COLLECTIONS.USERS).find(query).toArray()
  return users.map(toUser)
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) })
  if (!user) return null
  return toUser(user)
}

export interface RegisterUserInput {
  name: string
  email: string
  employeeId: string
  department: string
  password: string
}

export class RegistrationConflictError extends Error {
  code = 'CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'RegistrationConflictError'
  }
}

export async function registerUser(input: RegisterUserInput, role: 'user' | 'admin' = 'user'): Promise<User> {
  const db = await getDb()
  const email = input.email.trim().toLowerCase()
  const employeeId = input.employeeId.trim()
  const existingUser = await db.collection(COLLECTIONS.USERS).findOne({
    $or: [{ email }, { employeeId }],
  })
  if (existingUser) {
    throw new RegistrationConflictError('Email or employee ID already exists')
  }

  const passwordHash = await hashPassword(input.password)
  const now = new Date()
  const doc = {
    name: input.name.trim(),
    email,
    employeeId,
    department: input.department.trim(),
    role,
    isSupervisor: false,
    status: 'active' as const,
    supervisorId: null,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  }

  try {
    const result = await db.collection(COLLECTIONS.USERS).insertOne(doc)
    const registeredUser: User = {
      id: result.insertedId.toString(),
      name: doc.name,
      email: doc.email,
      employeeId: doc.employeeId,
      department: doc.department,
      role: doc.role,
      isSupervisor: doc.isSupervisor,
      status: doc.status,
      supervisorId: null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }

    await createActivity({
      userId: registeredUser.id,
      description: `User "${registeredUser.name}" registered.`,
    })

    return registeredUser
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new RegistrationConflictError('Email or employee ID already exists')
    }
    throw err
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const db = await getDb()
  const now = new Date()
  const passwordHash = await hashPassword(input.password)
  const firstName = input.firstName?.trim()
  const lastName = input.lastName?.trim()
  // Flow Integration Phase 2: managerId validated only when supplied (must be
  // an active user); legacy callers omit it and are unaffected.
  let managerObjectId: ObjectId | null = null
  if (input.managerId !== undefined && input.managerId !== null) {
    if (!ObjectId.isValid(input.managerId)) throw new Error('Invalid manager')
    const manager = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(input.managerId) })
    if (!manager || manager.status !== 'active') throw new Error('Manager not found or inactive')
    managerObjectId = manager._id as ObjectId
  }
  const doc: Record<string, any> = {
    name: composeName(firstName, lastName, input.name),
    firstName: firstName ?? '',
    lastName: lastName ?? '',
    email: input.email.toLowerCase(),
    employeeId: input.employeeId,
    department: input.department,
    role: input.role,
    isSupervisor: input.isSupervisor,
    status: input.status,
    supervisorId: input.supervisorId ? new ObjectId(input.supervisorId) : null,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  }
  // Flow Integration Phase 2: persist enrichment only when supplied (keeps
  // legacy docs key-absent; readers use ?? defaults).
  if (input.resourceType !== undefined) doc.resourceType = input.resourceType
  if (input.hireDate !== undefined) doc.hireDate = input.hireDate
  if (input.payType !== undefined) doc.payType = input.payType
  if (input.defaultPayRate !== undefined) doc.defaultPayRate = input.defaultPayRate
  if (input.employmentStatus !== undefined) doc.employmentStatus = input.employmentStatus
  if (managerObjectId !== null) doc.managerId = managerObjectId
  const result = await db.collection(COLLECTIONS.USERS).insertOne(doc)
  // Return an explicit field map (never spread `doc`) so the password hash is
  // not leaked in the API response.
  const createdUser: User = {
    id: result.insertedId.toString(),
    name: doc.name,
    firstName: doc.firstName || undefined,
    lastName: doc.lastName || undefined,
    email: doc.email,
    employeeId: doc.employeeId,
    department: doc.department,
    role: doc.role,
    isSupervisor: doc.isSupervisor,
    status: doc.status,
    supervisorId: doc.supervisorId?.toString(),
    resourceType: doc.resourceType,
    hireDate: doc.hireDate,
    payType: doc.payType,
    defaultPayRate: doc.defaultPayRate,
    employmentStatus: doc.employmentStatus,
    managerId: doc.managerId?.toString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }

  await createActivity({
    userId: createdUser.id,
    description: `User "${createdUser.name}" was created.`,
  })

  return createdUser
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User | null> {
  const db = await getDb()
  const existing = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) })
  if (!existing) return null

  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) update.name = input.name
  if (input.firstName !== undefined) update.firstName = input.firstName
  if (input.lastName !== undefined) update.lastName = input.lastName
  if (input.firstName !== undefined || input.lastName !== undefined) {
    // Recompose the display name from the newest first/last name parts,
    // falling back to the stored values for whichever part is unchanged.
    const first = (input.firstName ?? existing.firstName ?? '') as string
    const last = (input.lastName ?? existing.lastName ?? '') as string
    update.name = composeName(first, last, input.name ?? existing.name)
  }
  if (input.email !== undefined) update.email = input.email.toLowerCase()
  if (input.employeeId !== undefined) update.employeeId = input.employeeId
  if (input.department !== undefined) update.department = input.department
  if (input.role !== undefined) update.role = input.role
  if (input.isSupervisor !== undefined) update.isSupervisor = input.isSupervisor
  if (input.status !== undefined) update.status = input.status
  if (input.supervisorId !== undefined) update.supervisorId = input.supervisorId ? new ObjectId(input.supervisorId) : null
  if (input.password) update.passwordHash = await hashPassword(input.password)
  // Flow Integration Phase 2: enrichment, all optional. managerId validated
  // only when supplied (must be an active user); null clears it.
  if (input.resourceType !== undefined) update.resourceType = input.resourceType
  if (input.hireDate !== undefined) update.hireDate = input.hireDate
  if (input.payType !== undefined) update.payType = input.payType
  if (input.defaultPayRate !== undefined) update.defaultPayRate = input.defaultPayRate
  if (input.employmentStatus !== undefined) update.employmentStatus = input.employmentStatus
  if (input.managerId !== undefined) {
    if (input.managerId === null) {
      update.managerId = null
    } else {
      if (!ObjectId.isValid(input.managerId)) throw new Error('Invalid manager')
      const manager = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(input.managerId) })
      if (!manager || manager.status !== 'active') throw new Error('Manager not found or inactive')
      update.managerId = manager._id as ObjectId
    }
  }

  const result = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  )
  if (!result) return null
  const user = result

  // Revoke all sessions when password is changed
  if (input.password) {
    await revokeAllUserSessions(id)
  }

  const changes: string[] = []
  if (input.name !== undefined && input.name !== existing.name) changes.push(`name to "${input.name}"`)
  if (input.email !== undefined && input.email !== existing.email) changes.push(`email to "${input.email}"`)
  if (input.employeeId !== undefined && input.employeeId !== existing.employeeId) changes.push(`employee ID to "${input.employeeId}"`)
  if (input.department !== undefined && input.department !== existing.department) changes.push(`department to "${input.department}"`)
  if (input.role !== undefined && input.role !== existing.role) changes.push(`role to "${input.role}"`)
  if (input.isSupervisor !== undefined && input.isSupervisor !== existing.isSupervisor) changes.push(`supervisor capability to ${input.isSupervisor ? 'enabled' : 'disabled'}`)
  if (input.status !== undefined && input.status !== existing.status) changes.push(`status to "${input.status}"`)

  if (changes.length > 0) {
    await createActivity({
      userId: user._id.toString(),
      description: `User updated: ${changes.join(', ')}.`,
    })
  }

  if (input.supervisorId !== undefined && user.supervisorId?.toString() !== existing.supervisorId?.toString()) {
    if (user.supervisorId) {
      const supervisor = await db.collection(COLLECTIONS.USERS).findOne({ _id: user.supervisorId })
      const supervisorName = supervisor?.name || 'Your supervisor'
      await createNotification({
        userId: user._id.toString(),
        type: 'assignment',
        title: 'Supervisor Assigned',
        message: `${supervisorName} has been assigned as your supervisor.`,
        relatedId: user._id.toString(),
      })
    }
    if (existing.supervisorId) {
      await createNotification({
        userId: user._id.toString(),
        type: 'assignment',
        title: 'Supervisor Removed',
        message: 'Your supervisor has been removed.',
        relatedId: user._id.toString(),
      })
    }
    await createActivity({
      userId: user._id.toString(),
      description: `Supervisor assignment changed for user.`,
    })
  }

  return toUser(user)
}

export async function activateUser(id: string): Promise<User | null> {
  const user = await updateUser(id, { status: 'active' })
  if (user) {
    await createActivity({
      userId: user.id,
      description: `User "${user.name}" was activated.`,
    })
  }
  return user
}

export async function deactivateUser(id: string): Promise<User | null> {
  const user = await updateUser(id, { status: 'inactive' })
  if (user) {
    await revokeAllUserSessions(id)
    invalidateUserCache(id)
    await createActivity({
      userId: user.id,
      description: `User "${user.name}" was deactivated.`,
    })
  }
  return user
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ email: email.toLowerCase() })
  if (!user) return null
  return toUser(user)
}

export async function getUserByEmployeeId(employeeId: string): Promise<User | null> {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ employeeId })
  if (!user) return null
  return toUser(user)
}

export async function getSupervisors(): Promise<User[]> {
  return getUsers({ isSupervisor: true, status: 'active' })
}

export async function getSupervisorUsers(supervisorId: string): Promise<User[]> {
  return getUsers({ supervisorId, status: 'active' })
}
