import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

const SALT_ROUNDS = 12

export function validatePasswordStrength(password: string): void {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long')
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter')
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('Password must contain at least one number')
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password)
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

const MAX_SESSIONS_PER_USER = 5

export async function createSession(userId: string, refreshToken: string) {
  const db = await getDb()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  // Prune oldest sessions if user has too many
  const existingSessions = await db
    .collection(COLLECTIONS.SESSIONS)
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: 1 })
    .toArray()

  if (existingSessions.length >= MAX_SESSIONS_PER_USER) {
    const sessionsToDelete = existingSessions.slice(0, existingSessions.length - MAX_SESSIONS_PER_USER + 1)
    const sessionIds = sessionsToDelete.map((s) => s._id)
    await db.collection(COLLECTIONS.SESSIONS).deleteMany({ _id: { $in: sessionIds } })
  }

  await db.collection(COLLECTIONS.SESSIONS).insertOne({
    userId: new ObjectId(userId),
    refreshToken,
    expiresAt,
    createdAt: new Date(),
  })
  return expiresAt
}

export async function validateSession(refreshToken: string) {
  const db = await getDb()
  const session = await db.collection(COLLECTIONS.SESSIONS).findOne({
    refreshToken,
    expiresAt: { $gt: new Date() },
  })
  return session
}

export async function deleteSession(refreshToken: string) {
  const db = await getDb()
  await db.collection(COLLECTIONS.SESSIONS).deleteOne({ refreshToken })
}

export async function deleteUserSessions(userId: string) {
  const db = await getDb()
  await db.collection(COLLECTIONS.SESSIONS).deleteMany({ userId: new ObjectId(userId) })
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = await getDb()
  await db.collection(COLLECTIONS.SESSIONS).deleteMany({ userId: new ObjectId(userId) })
}

export async function loginUser(email: string, password: string) {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ email: email.toLowerCase(), status: 'active' })
  if (!user) {
    throw new Error('Invalid email or password')
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw new Error('Invalid email or password')
  }

  const accessToken = await signAccessToken({ userId: user._id.toString(), role: user.role, isSupervisor: user.isSupervisor })
  const refreshToken = await signRefreshToken({ userId: user._id.toString(), sessionId: user._id.toString() })
  await createSession(user._id.toString(), refreshToken)

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      employeeId: user.employeeId,
      department: user.department,
      role: user.role,
      isSupervisor: user.isSupervisor,
      status: user.status,
      supervisorId: user.supervisorId?.toString(),
    },
    accessToken,
    refreshToken,
  }
}

export async function refreshUserSession(refreshToken: string) {
  const payload = await verifyRefreshToken(refreshToken)
  if (!payload) {
    throw new Error('Invalid or expired refresh token')
  }

  const session = await validateSession(refreshToken)
  if (!session) {
    throw new Error('Session not found or expired')
  }

  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(payload.userId), status: 'active' })
  if (!user) {
    throw new Error('User not found or inactive')
  }

  const newAccessToken = await signAccessToken({ userId: user._id.toString(), role: user.role, isSupervisor: user.isSupervisor })
  return { accessToken: newAccessToken }
}

export async function logoutUser(refreshToken: string | undefined) {
  if (refreshToken) {
    await deleteSession(refreshToken)
  }
}

export async function getMe(req: AuthenticatedRequest) {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(req.user!.userId) })
  if (!user) {
    throw new Error('User not found')
  }
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    department: user.department,
    role: user.role,
    isSupervisor: user.isSupervisor,
    status: user.status,
    supervisorId: user.supervisorId?.toString(),
  }
}
