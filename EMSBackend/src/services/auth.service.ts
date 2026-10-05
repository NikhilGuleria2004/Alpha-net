import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import { signAccessToken } from '../lib/jwt.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { resolveEmsRole, isEmsRole } from '../lib/role.js'
import type { UserRole } from '../types/auth.js'
import { logger } from '../lib/logger.js'
import { sendPasswordResetEmail, sendWelcomeEmail } from '../lib/email.js'
import { createActivity } from './activity.service.js'
import { createNotification } from './notification.service.js'

const SALT_ROUNDS = 12
const PASSWORD_RESET_TOKEN_BYTES = 32
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000
const REFRESH_TOKEN_BYTES = 32
const MAX_SESSIONS_PER_USER = 5

export function validatePasswordStrength(password: string): void {
  if (password.length < 8) throw new Error('Password must be at least 8 characters long')
  if (!/[A-Z]/.test(password)) throw new Error('Password must contain at least one uppercase letter')
  if (!/[a-z]/.test(password)) throw new Error('Password must contain at least one lowercase letter')
  if (!/[0-9]/.test(password)) throw new Error('Password must contain at least one number')
}

export async function hashPassword(password: string): Promise<string> {
  validatePasswordStrength(password)
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// ── Opaque refresh tokens (EMS spec §4.3) ────────────────────────────────────

function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export async function createSession(userId: string, refreshToken: string, userAgent?: string, ip?: string) {
  const db = await getDb()
  const refreshHash = hashRefreshToken(refreshToken)
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS)
  const now = new Date()

  const existingSessions = await db
    .collection(COLLECTIONS.SESSIONS)
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: 1 })
    .toArray()

  if (existingSessions.length >= MAX_SESSIONS_PER_USER) {
    const toDelete = existingSessions.slice(0, existingSessions.length - MAX_SESSIONS_PER_USER + 1)
    const ids = toDelete.map((s) => s._id)
    await db.collection(COLLECTIONS.SESSIONS).deleteMany({ _id: { $in: ids } })
  }

  await db.collection(COLLECTIONS.SESSIONS).insertOne({
    userId: new ObjectId(userId),
    refreshHash,
    expiresAt,
    userAgent: userAgent ?? null,
    ip: ip ?? null,
    createdAt: now,
  })
  return expiresAt
}

export async function validateSession(refreshToken: string) {
  const db = await getDb()
  const refreshHash = hashRefreshToken(refreshToken)
  return db.collection(COLLECTIONS.SESSIONS).findOne({
    refreshHash,
    expiresAt: { $gt: new Date() },
  })
}

export async function deleteSession(refreshToken: string) {
  const db = await getDb()
  const refreshHash = hashRefreshToken(refreshToken)
  await db.collection(COLLECTIONS.SESSIONS).deleteOne({ refreshHash })
}

export async function deleteUserSessions(userId: string) {
  const db = await getDb()
  await db.collection(COLLECTIONS.SESSIONS).deleteMany({ userId: new ObjectId(userId) })
}

// Rotate: atomically delete old session and create new one (§4.3 "rotation on use")
export async function rotateSession(oldRefreshToken: string, newRefreshToken: string, userId: string, userAgent?: string, ip?: string) {
  const db = await getDb()
  const oldHash = hashRefreshToken(oldRefreshToken)
  const newHash = hashRefreshToken(newRefreshToken)
  const newExpiresAt = new Date(Date.now() + REFRESH_TTL_MS)
  const now = new Date()

  // findOneAndDelete is atomic — only one caller can claim the token.
  const session = await db.collection(COLLECTIONS.SESSIONS).findOneAndDelete({
    refreshHash: oldHash,
    expiresAt: { $gt: new Date() },
  })
  if (!session) {
    throw new Error('Invalid or expired refresh token')
  }

  await db.collection(COLLECTIONS.SESSIONS).insertOne({
    userId: new ObjectId(userId),
    refreshHash: newHash,
    expiresAt: newExpiresAt,
    userAgent: userAgent ?? null,
    ip: ip ?? null,
    createdAt: now,
  })

  return newExpiresAt
}

// ── User response builder ─────────────────────────────────────────────────

interface UserDoc {
  _id: ObjectId
  name?: string
  email?: string
  employeeId?: string
  department?: string
  role?: string
  /** EMS-owned role override; see lib/role.ts (D-19). */
  emsRole?: string
  status?: string
  billable?: boolean
  payRate?: number | null
  currency?: string
  employmentType?: string
  title?: string
  managerId?: ObjectId | string
  supervisorId?: ObjectId | string
  avatarUrl?: string
  joinedAt?: Date
  createdAt?: Date
  updatedAt?: Date
  passwordHash?: string
  [key: string]: unknown
}

function toISOString(date: Date | string | undefined): string | undefined {
  if (!date) return undefined
  return new Date(date).toISOString()
}

function toStrId(id: unknown): string | undefined {
  if (id === undefined || id === null || id === '') return undefined
  return String(id)
}

export function buildUserResponse(user: UserDoc) {
  return {
    id: user._id.toString(),
    name: user.name ?? '',
    email: user.email ?? '',
    employeeId: user.employeeId ?? '',
    department: user.department ?? '',
    role: resolveEmsRole(user),
    status: user.status ?? 'active',
    billable: user.billable ?? false,
    payRate: user.payRate ?? null,
    currency: user.currency ?? undefined,
    employmentType: user.employmentType ?? undefined,
    title: user.title ?? undefined,
    managerId: toStrId(user.managerId),
    supervisorId: toStrId(user.supervisorId),
    avatarUrl: user.avatarUrl ?? undefined,
    joinedAt: toISOString(user.joinedAt),
    createdAt: toISOString(user.createdAt),
    updatedAt: toISOString(user.updatedAt),
  }
}

// ── Auth flows ──────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string, userAgent?: string, ip?: string) {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({
    email: email.toLowerCase(),
    status: { $in: ['active', 'invited'] },
  })
  if (!user) {
    throw new Error('Invalid email or password')
  }

  if (!user.passwordHash) {
    throw new Error('Invalid email or password')
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    throw new Error('Invalid email or password')
  }

  // Activate invited users on first login with a password
  if (user.status === 'invited' && user.passwordHash) {
    await db.collection(COLLECTIONS.USERS).updateOne(
      { _id: user._id },
      { $set: { status: 'active', updatedAt: new Date() } },
    )
    user.status = 'active'
  }

  const accessToken = await signAccessToken({
    userId: user._id.toString(),
    role: resolveEmsRole(user),
    billable: user.billable ?? false,
  })
  const refreshToken = generateRefreshToken()
  await createSession(user._id.toString(), refreshToken, userAgent, ip)

  logger.info({ userId: user._id.toString(), email: user.email }, 'user logged in')

  return {
    user: buildUserResponse(user),
    accessToken,
    refreshToken,
  }
}

export async function refreshUserSession(refreshToken: string, userAgent?: string, ip?: string) {
  const session = await validateSession(refreshToken)
  if (!session) {
    throw new Error('Invalid or expired refresh token')
  }

  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({
    _id: new ObjectId(session.userId),
    status: { $in: ['active', 'invited', 'on_leave'] },
  })
  if (!user) {
    throw new Error('User not found or inactive')
  }

  const newRefreshToken = generateRefreshToken()
  await rotateSession(refreshToken, newRefreshToken, user._id.toString(), userAgent, ip)

  const accessToken = await signAccessToken({
    userId: user._id.toString(),
    role: resolveEmsRole(user),
    billable: user.billable ?? false,
  })

  logger.info({ userId: user._id.toString() }, 'access token refreshed')

  return { accessToken, refreshToken: newRefreshToken }
}

export async function logoutUser(refreshToken: string | undefined) {
  if (refreshToken) {
    await deleteSession(refreshToken)
  }
}

export async function getMe(userId: string) {
  const db = await getDb()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(userId) })
  if (!user) {
    throw new Error('User not found')
  }
  return buildUserResponse(user)
}

// ── Password reset (forgot-password flow) ──────────────────────────────────

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function requestPasswordReset(email: string) {
  const db = await getDb()
  const normalized = email.toLowerCase().trim()
  const user = await db.collection(COLLECTIONS.USERS).findOne({ email: normalized })

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

export async function resetPasswordWithToken(token: string, newPassword: string) {
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

  // Single-use: mark consumed
  await db.collection(COLLECTIONS.PASSWORD_RESETS).updateOne(
    { _id: record._id },
    { $set: { usedAt: new Date() } },
  )

  // Revoke all sessions so every device must re-authenticate
  await deleteUserSessions(record.userId.toString())
  logger.info({ userId: record.userId.toString() }, 'password reset completed')
}

// ── Invite redemption (EMS §4.3, §7.1) ────────────────────────────────────

export async function redeemInvite(token: string, password: string, userAgent?: string, ip?: string) {
  const db = await getDb()
  const now = new Date()
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  // Look up by tokenHash; single-use + not expired.
  const invite = await db.collection(COLLECTIONS.INVITES).findOne({
    tokenHash,
    redeemedAt: null,
    expiresAt: { $gt: now },
  })
  if (!invite) {
    throw new Error('Invalid or expired invite token')
  }

  // Billable guardrail (§6.3): billable=true requires payRate > 0 + currency
  if (invite.billable === true && !(invite.payRate && invite.payRate > 0)) {
    throw new Error('Set a pay rate before marking this resource billable')
  }

  // Hash password
  const passwordHash = await hashPassword(password)

   // Find or create the user by email
   const email = invite.email.toLowerCase().trim()
   let existingUser = await db.collection(COLLECTIONS.USERS).findOne({ email })

  // The platform's invite documents keep their own role vocabulary, which
  // includes 'supervisor' (backend/src/services/invite.service.ts). That is not
  // an EMS role, so coerce anything unrecognised to the `employee` floor rather
  // than writing a value EMS cannot resolve. See D-21.
  const role: UserRole = isEmsRole(invite.role) ? invite.role : 'employee'

  if (existingUser) {
    await db.collection(COLLECTIONS.USERS).updateOne(
      { _id: existingUser._id },
      {
        $set: {
          name: invite.firstName && invite.lastName
            ? `${invite.firstName.trim()} ${invite.lastName.trim()}`
            : existingUser.name,
          firstName: invite.firstName ?? existingUser.firstName,
          lastName: invite.lastName ?? existingUser.lastName,
          employeeId: invite.employeeId ?? existingUser.employeeId,
          department: invite.department ?? existingUser.department,
          passwordHash,
          role,
          billable: invite.billable ?? existingUser.billable ?? false,
          payRate: invite.payRate ?? existingUser.payRate ?? null,
          currency: invite.currency ?? existingUser.currency ?? 'USD',
          status: 'active',
          updatedAt: now,
        },
      },
    )
  } else {
    const newUserDoc = {
      name: invite.firstName && invite.lastName
        ? `${invite.firstName.trim()} ${invite.lastName.trim()}`
        : `User ${email}`,
      firstName: invite.firstName ?? '',
      lastName: invite.lastName ?? '',
      email,
      employeeId: invite.employeeId ?? '',
      department: invite.department ?? '',
      role,
      // EMS-owned role override so an invitee is addressable in EMS even though
      // `role` holds a platform value. See lib/role.ts (D-19).
      emsRole: role,
      billable: invite.billable ?? false,
      payRate: invite.payRate ?? null,
      currency: invite.currency ?? 'USD',
      status: 'active' as const,
      supervisorId: invite.supervisorId ? new ObjectId(invite.supervisorId) : null,
      managerId: invite.managerId ? new ObjectId(invite.managerId) : null,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    }
    const result = await db.collection(COLLECTIONS.USERS).insertOne(newUserDoc)
    existingUser = { _id: result.insertedId, ...newUserDoc }
  }

  // Mark invite as redeemed (single-use)
  await db.collection(COLLECTIONS.INVITES).updateOne(
    { _id: invite._id },
    { $set: { redeemedAt: now } },
  )

  await createActivity({
    userId: existingUser._id.toString(),
    description: 'Account activated via invite redemption.',
  })

  // Best-effort welcome notification + email
  try {
    await createNotification({
      userId: existingUser._id.toString(),
      type: 'assignment',
      title: 'Welcome!',
      message: 'Your account has been activated. You can now sign in.',
    })
  } catch {
    // non-critical
  }
  try {
    await sendWelcomeEmail(email, existingUser.name || email)
  } catch (err) {
    logger.warn({ err, email }, 'welcome email failed')
  }

  const accessToken = await signAccessToken({
    userId: existingUser._id.toString(),
    role,
    billable: invite.billable ?? false,
  })
  const refreshToken = generateRefreshToken()
  await createSession(existingUser._id.toString(), refreshToken, userAgent, ip)

  logger.info({ userId: existingUser._id.toString(), email: email }, 'invite redeemed and account activated')

  return {
    user: buildUserResponse({ ...existingUser, _id: existingUser._id, role, status: 'active' }),
    accessToken,
    refreshToken,
  }
}
