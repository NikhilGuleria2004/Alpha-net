import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { hashPassword } from './auth.service.js'
import { ObjectId } from 'mongodb'
import { createNotification } from './notification.service.js'
import { createActivity } from './activity.service.js'

export interface User {
  _id: string
  name: string
  email: string
  employeeId: string
  department: string
  role: 'admin' | 'user'
  isSupervisor: boolean
  status: 'active' | 'inactive'
  supervisorId?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserInput {
  name: string
  email: string
  employeeId: string
  department: string
  role: 'admin' | 'user'
  isSupervisor: boolean
  status: 'active' | 'inactive'
  supervisorId?: string | null
  password: string
}

export interface UpdateUserInput {
  name?: string
  email?: string
  employeeId?: string
  department?: string
  role?: 'admin' | 'user'
  isSupervisor?: boolean
  status?: 'active' | 'inactive'
  supervisorId?: string | null
  password?: string
}

export async function getUsers(filters?: { role?: string; status?: string; isSupervisor?: boolean; supervisorId?: string }): Promise<User[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (filters?.role) query.role = filters.role
  if (filters?.status) query.status = filters.status
  if (filters?.isSupervisor !== undefined) query.isSupervisor = filters.isSupervisor
  if (filters?.supervisorId) query.supervisorId = new ObjectId(filters.supervisorId)

  const users = await db.collection(COLLECTIONS.USERS).find(query).toArray()
  return users.map((u) => ({
    _id: u._id.toString(),
    name: u.name,
    email: u.email,
    employeeId: u.employeeId,
    department: u.department,
    role: u.role,
    isSupervisor: u.isSupervisor,
    status: u.status,
    supervisorId: u.supervisorId?.toString(),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }))
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) })
  if (!user) return null
  return {
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    department: user.department,
    role: user.role,
    isSupervisor: user.isSupervisor,
    status: user.status,
    supervisorId: user.supervisorId?.toString(),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const db = await getDb()
  const now = new Date()
  const passwordHash = await hashPassword(input.password)
  const doc = {
    name: input.name,
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
  const result = await db.collection(COLLECTIONS.USERS).insertOne(doc)
  const createdUser = {
    _id: result.insertedId.toString(),
    ...doc,
    supervisorId: doc.supervisorId?.toString(),
  } as User

  await createActivity({
    userId: createdUser._id,
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
  if (input.email !== undefined) update.email = input.email.toLowerCase()
  if (input.employeeId !== undefined) update.employeeId = input.employeeId
  if (input.department !== undefined) update.department = input.department
  if (input.role !== undefined) update.role = input.role
  if (input.isSupervisor !== undefined) update.isSupervisor = input.isSupervisor
  if (input.status !== undefined) update.status = input.status
  if (input.supervisorId !== undefined) update.supervisorId = input.supervisorId ? new ObjectId(input.supervisorId) : null
  if (input.password) update.passwordHash = await hashPassword(input.password)

  const result = await db.collection(COLLECTIONS.USERS).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' }
  )
  if (!result) return null
  const user = result.value
  if (!user) return null

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

  return {
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    department: user.department,
    role: user.role,
    isSupervisor: user.isSupervisor,
    status: user.status,
    supervisorId: user.supervisorId?.toString(),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function activateUser(id: string): Promise<User | null> {
  const user = await updateUser(id, { status: 'active' })
  if (user) {
    await createActivity({
      userId: user._id,
      description: `User "${user.name}" was activated.`,
    })
  }
  return user
}

export async function deactivateUser(id: string): Promise<User | null> {
  const user = await updateUser(id, { status: 'inactive' })
  if (user) {
    await createActivity({
      userId: user._id,
      description: `User "${user.name}" was deactivated.`,
    })
  }
  return user
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ email: email.toLowerCase() })
  if (!user) return null
  return {
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    department: user.department,
    role: user.role,
    isSupervisor: user.isSupervisor,
    status: user.status,
    supervisorId: user.supervisorId?.toString(),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function getUserByEmployeeId(employeeId: string): Promise<User | null> {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ employeeId })
  if (!user) return null
  return {
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    department: user.department,
    role: user.role,
    isSupervisor: user.isSupervisor,
    status: user.status,
    supervisorId: user.supervisorId?.toString(),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export async function getSupervisors(): Promise<User[]> {
  return getUsers({ isSupervisor: true, status: 'active' })
}

export async function getSupervisorUsers(supervisorId: string): Promise<User[]> {
  return getUsers({ supervisorId, status: 'active' })
}
