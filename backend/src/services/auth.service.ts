import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { sendPasswordResetEmail, sendLoginOtpEmail } from '../lib/email.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

const SALT_ROUNDS = 12
const PASSWORD_RESET_TOKEN_BYTES = 32
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

// --- Login OTP (forgot-password login) -------------------------------------
// A short one-time code emailed to the registered address. The code is never
// stored in plain text — only a SHA-256 hash. Codes expire after 10 minutes,
// are single-use, are capped at 5 verification attempts, and a new request
// invalidates any previous unused code for that email.
const OTP_LENGTH = 6
const OTP_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_COOLDOWN_MS = 60 * 1000 // 1 minute between sends

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

// QA M4: self-service password change. Verifies the current password, then
// hashes and stores the new one and revokes all existing sessions so the user
// must re-authenticate on every other device.
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  validatePasswordStrength(newPassword)
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(userId) })
  if (!user) {
    throw new Error('User not found')
  }
  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    throw new Error('Current password is incorrect')
  }
  const newHash = await hashPassword(newPassword)
  await db.collection(COLLECTIONS.USERS).updateOne(
    { _id: new ObjectId(userId) },
    { $set: { passwordHash: newHash, updatedAt: new Date() } },
  )
  await deleteUserSessions(userId)
  logger.info({ userId }, 'password changed and sessions revoked')
}

// --- Password reset (forgot-password flow) ---------------------------------
// Tokens are single-use, expire after 1 hour, and only a SHA-256 hash is
// stored in the DB. The response is always the same regardless of whether the
// account exists, so the endpoint cannot be used to enumerate users.

function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

function generateOtp(): string {
  // crypto.randomInt is uniform and CSPRNG-backed; pad to keep leading zeros.
  const max = 10 ** OTP_LENGTH
  return crypto.randomInt(0, max).toString().padStart(OTP_LENGTH, '0')
}

function buildAuthTokens(user: { _id: ObjectId; role: string; isSupervisor: boolean }) {
  return {
    userId: user._id.toString(),
    role: user.role,
    isSupervisor: user.isSupervisor,
  }
}

export async function requestLoginOtp(email: string): Promise<void> {
  const db = await getDb()
  const normalized = email.toLowerCase().trim()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ email: normalized })

  // Unknown email: behave identically (log + resolve) — never reveal it.
  if (!user) {
    logger.info({ email: normalized }, 'login OTP requested for unknown email')
    return
  }
  if (user.status !== 'active') {
    logger.info({ email: normalized }, 'login OTP requested for inactive account')
    return
  }

  const now = new Date()
  const latest = await db
    .collection(COLLECTIONS.LOGIN_OTPS)
    .findOne({ email: normalized, usedAt: null }, { sort: { createdAt: -1 } })
  if (latest && now.getTime() - new Date(latest.createdAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new Error('Please wait a minute before requesting a new code')
  }

  // Invalidate any previous unused codes for this email.
  await db.collection(COLLECTIONS.LOGIN_OTPS).updateMany(
    { email: normalized, usedAt: null },
    { $set: { usedAt: now } },
  )

  const code = generateOtp()
  await db.collection(COLLECTIONS.LOGIN_OTPS).insertOne({
    email: normalized,
    userId: user._id,
    otpHash: hashOtp(code),
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
    createdAt: now,
    usedAt: null,
    attempts: 0,
  })

  try {
    await sendLoginOtpEmail(normalized, code)
  } catch (err) {
    logger.error({ err, email: normalized }, 'login OTP email failed')
  }
}

export async function verifyLoginOtp(email: string, otp: string) {
  const db = await getDb()
  const normalized = email.toLowerCase().trim()
  const record = await db.collection(COLLECTIONS.LOGIN_OTPS).findOne({
    email: normalized,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  })
  if (!record) {
    throw new Error('Invalid or expired code')
  }
  if ((record.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    await db.collection(COLLECTIONS.LOGIN_OTPS).updateOne(
      { _id: record._id },
      { $set: { usedAt: new Date() } },
    )
    throw new Error('Too many attempts. Request a new code.')
  }

  const presented = hashOtp(otp.trim())
  const expected = Buffer.from(record.otpHash)
  const actual = Buffer.from(presented)
  const match = expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  if (!match) {
    await db.collection(COLLECTIONS.LOGIN_OTPS).updateOne(
      { _id: record._id },
      { $inc: { attempts: 1 } },
    )
    throw new Error('Invalid or expired code')
  }

  // Single-use: consume before issuing tokens.
  await db.collection(COLLECTIONS.LOGIN_OTPS).updateOne(
    { _id: record._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  )

  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: record.userId, status: 'active' })
  if (!user) {
    throw new Error('User not found or inactive')
  }

  const accessToken = await signAccessToken(buildAuthTokens(user))
  const refreshToken = await signRefreshToken({ userId: user._id.toString(), sessionId: user._id.toString() })
  await createSession(user._id.toString(), refreshToken)

  logger.info({ userId: user._id.toString() }, 'login via OTP completed')
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

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function requestPasswordReset(email: string): Promise<void> {
  const db = await getDb()
  const normalized = email.toLowerCase().trim()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ email: normalized })

  // Unknown email: behave identically (log + resolve) — never reveal it.
  if (!user) {
    logger.info({ email: normalized }, 'password reset requested for unknown email')
    return
  }

  const token = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex')
  const tokenHash = hashResetToken(token)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRY_MS)

  await db.collection(COLLECTIONS.PASSWORD_RESETS).insertOne({
    tokenHash,
    userId: user._id,
    email: normalized,
    expiresAt,
    createdAt: now,
    usedAt: null,
  })

  try {
    await sendPasswordResetEmail(normalized, token)
  } catch (err) {
    logger.error({ err, email: normalized }, 'password reset email failed')
  }
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  validatePasswordStrength(newPassword)
  const db = await getDb()
  const tokenHash = hashResetToken(token)
  const record = await db.collection(COLLECTIONS.PASSWORD_RESETS).findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  })
  if (!record) {
    throw new Error('Invalid or expired reset token')
  }

  const newHash = await hashPassword(newPassword)
  await db.collection(COLLECTIONS.USERS).updateOne(
    { _id: record.userId },
    { $set: { passwordHash: newHash, updatedAt: new Date() } },
  )

  // Single-use: mark consumed, then revoke all sessions so every device must re-login.
  await db.collection(COLLECTIONS.PASSWORD_RESETS).updateOne(
    { _id: record._id },
    { $set: { usedAt: new Date() } },
  )
  await deleteUserSessions(record.userId.toString())
  logger.info({ userId: record.userId.toString() }, 'password reset completed')
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
