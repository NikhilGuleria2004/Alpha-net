import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import crypto from 'node:crypto'
import { createActivity } from './activity.service.js'
import { hashPassword } from './auth.service.js'
import { createNotification } from './notification.service.js'
import { parseObjectId } from '../lib/objectid.js'
import { logger } from '../lib/logger.js'
import { sendInviteEmail, sendResendInviteEmail, sendWelcomeEmail } from '../lib/email.js'

export interface Invite {
  id: string
  email: string
  role: 'user' | 'supervisor' | 'admin'
  token: string
  invitedBy: string
  projectId?: string
  firstName?: string
  lastName?: string
  /** Resolved display names (populated by listInvites). */
  invitedByName?: string
  inviteeName?: string
  createdAt: Date
  expiresAt: Date
  acceptedAt?: Date
}

export interface CreateInviteInput {
  email: string
  role: 'user' | 'supervisor' | 'admin'
  invitedBy: string
  firstName?: string
  lastName?: string
  employeeId?: string
  department?: string
  supervisorId?: string
  projectId?: string
}

export interface RedeemInviteInput {
  token: string
  password: string
  firstName?: string
  lastName?: string
  employeeId?: string
  department?: string
}

const INVITE_TOKEN_BYTES = 32
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** Display name composed from the profile parts. */
function composeName(firstName?: string | null, lastName?: string | null): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ')
}

/** Map the onboarding role onto the user record's role/isSupervisor pair. */
function roleFlags(role: 'user' | 'supervisor' | 'admin'): { role: 'admin' | 'user'; isSupervisor: boolean } {
  if (role === 'admin') return { role: 'admin', isSupervisor: false }
  if (role === 'supervisor') return { role: 'user', isSupervisor: true }
  return { role: 'user', isSupervisor: false }
}

function generateToken(): string {
  return crypto.randomBytes(INVITE_TOKEN_BYTES).toString('hex')
}

export async function findInviteByToken(token: string): Promise<Invite | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.INVITES).findOne({ token })
  if (!doc) return null
  return mapInvite(doc)
}

export async function findInviteByEmail(email: string): Promise<Invite | null> {
  const db = await getDb()
  const doc = await db.collection(COLLECTIONS.INVITES).findOne({ email: email.toLowerCase().trim() })
  if (!doc) return null
  return mapInvite(doc)
}

export async function createInvite(input: CreateInviteInput): Promise<Invite> {
  const db = await getDb()
  const now = new Date()

  // Idempotency: if a pending invite already exists for this email, return it
  const existing = await findInviteByEmail(input.email)
  if (existing && !existing.acceptedAt && existing.expiresAt > now) {
    return existing
  }

  const token = generateToken()
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_MS)

  const firstName = input.firstName?.trim() ?? ''
  const lastName = input.lastName?.trim() ?? ''
  const { role, isSupervisor } = roleFlags(input.role)

  // Create the user row with status 'invited' (no password yet) and the full
  // profile captured by the onboarding flow.
  const userDoc = {
    name: composeName(firstName, lastName),
    firstName,
    lastName,
    email: input.email.toLowerCase().trim(),
    employeeId: input.employeeId?.trim() ?? '',
    department: input.department?.trim() ?? '',
    role,
    isSupervisor,
    status: 'invited' as const,
    supervisorId: input.supervisorId ? parseObjectId(input.supervisorId) : null,
    passwordHash: '',
    createdAt: now,
    updatedAt: now,
  }
  const userResult = await db.collection(COLLECTIONS.USERS).insertOne(userDoc)
  const userId = userResult.insertedId.toString()

  const inviteDoc = {
    email: input.email.toLowerCase().trim(),
    role: input.role,
    token,
    invitedBy: parseObjectId(input.invitedBy),
    projectId: input.projectId ? parseObjectId(input.projectId) : null,
    userId,
    createdAt: now,
    expiresAt,
    acceptedAt: null,
  }
  const inviteResult = await db.collection(COLLECTIONS.INVITES).insertOne(inviteDoc)

  // Send invite email via nodemailer SMTP transport (log-only when SMTP_HOST is blank)
  try {
    await sendInviteEmail(input.email, token)
  } catch (err) {
    logger.warn({ err, email: input.email }, 'invite email failed to send — token still active')
  }

  await createActivity({
    userId: input.invitedBy,
    description: `Invite sent to ${input.email} (${input.role}).`,
  })

  return {
    id: inviteResult.insertedId.toString(),
    email: inviteDoc.email,
    role: inviteDoc.role,
    token: inviteDoc.token,
    invitedBy: input.invitedBy,
    projectId: input.projectId,
    createdAt: inviteDoc.createdAt,
    expiresAt: inviteDoc.expiresAt,
  }
}

export async function redeemInvite(input: RedeemInviteInput): Promise<{ user: { id: string; email: string; role: 'user' | 'supervisor' | 'admin'; isSupervisor: boolean; status: string; name: string } | null; invite: Invite | null }> {
  const db = await getDb()
  const now = new Date()

  const invite = await db.collection(COLLECTIONS.INVITES).findOne({ token: input.token })
  if (!invite) {
    return { user: null, invite: null }
  }
  if (invite.expiresAt < now) {
    return { user: null, invite: null }
  }
  if (invite.acceptedAt) {
    return { user: null, invite: null }
  }

  // Find the user associated with this invite
  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: invite.userId })
  if (!user) {
    return { user: null, invite: null }
  }

  // Set password, activate, and apply any profile details the invitee
  // completed on the redeem form (first/last name, employee ID, department).
  const firstName = input.firstName?.trim() || user.firstName || ''
  const lastName = input.lastName?.trim() || user.lastName || ''
  const passwordHash = await hashPassword(input.password)
  await db.collection(COLLECTIONS.USERS).updateOne(
    { _id: invite.userId },
    {
      $set: {
        name: composeName(firstName, lastName) || user.name || `User ${user.email}`,
        firstName,
        lastName,
        employeeId: input.employeeId?.trim() || user.employeeId || '',
        department: input.department?.trim() || user.department || '',
        passwordHash,
        status: 'active',
        updatedAt: now,
      },
    },
  )

  // If the invite carried a project assignment, put the new user on the team.
  if (invite.projectId) {
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: invite.projectId })
    if (project) {
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { _id: invite.projectId },
        { $addToSet: { teamMemberIds: invite.userId } },
      )
    }
  }

  // Mark invite as accepted
  await db.collection(COLLECTIONS.INVITES).updateOne(
    { _id: invite._id },
    { $set: { acceptedAt: now } },
  )

  await createActivity({
    userId: invite.userId.toString(),
    description: `Account activated via invite.`,
  })

  // Send welcome notification
  try {
    await createNotification({
      userId: invite.userId.toString(),
      type: 'assignment',
      title: 'Welcome!',
      message: 'Your account has been activated. You can now log in.',
    })
  } catch {
    // Notification failure is non-critical
  }

  // Best-effort welcome email — redeem must succeed even if SMTP is down.
  try {
    await sendWelcomeEmail(invite.email, user.name || invite.email)
  } catch (err) {
    logger.warn({ err, email: invite.email }, 'welcome email failed')
  }

  return {
    user: {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      isSupervisor: user.isSupervisor,
      status: 'active',
      name: composeName(firstName, lastName) || user.name || `User ${user.email}`,
    },
    invite: mapInvite(invite),
  }
}

export async function resendInvite(inviteId: string): Promise<Invite | null> {
  const db = await getDb()
  const now = new Date()
  const newToken = generateToken()
  const newExpiresAt = new Date(now.getTime() + INVITE_EXPIRY_MS)

  const result = await db.collection(COLLECTIONS.INVITES).findOneAndUpdate(
    { _id: new ObjectId(inviteId), acceptedAt: null },
    { $set: { token: newToken, expiresAt: newExpiresAt } },
    { returnDocument: 'after' },
  )
  if (!result) return null

  // Send email with new token
  try {
    await sendResendInviteEmail(result.email, newToken)
  } catch (err) {
    logger.warn({ err, email: result.email }, 'resend invite email failed')
  }

  return mapInvite(result)
}

export async function revokeInvite(inviteId: string): Promise<boolean> {
  const db = await getDb()
  const result = await db.collection(COLLECTIONS.INVITES).deleteOne({ _id: new ObjectId(inviteId) })
  return result.deletedCount > 0
}

export async function listInvites(filters?: { status?: 'pending' | 'accepted' | 'expired'; page?: number; limit?: number }): Promise<Invite[]> {
  const db = await getDb()
  const now = new Date()
  const query: Record<string, unknown> = {}

  if (filters?.status === 'pending') {
    query.acceptedAt = null
    query.expiresAt = { $gt: now }
  } else if (filters?.status === 'accepted') {
    query.acceptedAt = { $ne: null }
  } else if (filters?.status === 'expired') {
    query.acceptedAt = null
    query.expiresAt = { $lte: now }
  }

  const skip = filters?.page && filters?.limit ? (filters.page - 1) * filters.limit : 0
  const limit = filters?.limit ?? 50

  const invites = await db
    .collection(COLLECTIONS.INVITES)
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray()

  const mapped = invites.map(mapInvite).filter(Boolean) as Invite[]

  // Resolve human names: the inviting admin (from invitedBy) and the invitee
  // (from the pre-created user row, matched by email).
  const adminIds = Array.from(new Set(mapped.map((i) => i.invitedBy).filter(Boolean)))
  const emails = Array.from(new Set(mapped.map((i) => i.email)))
  const [admins, invitees] = await Promise.all([
    adminIds.length
      ? db.collection(COLLECTIONS.USERS).find({ _id: { $in: adminIds.map((id) => parseObjectId(id)) } }).toArray()
      : Promise.resolve([]),
    emails.length
      ? db.collection(COLLECTIONS.USERS).find({ email: { $in: emails } }).toArray()
      : Promise.resolve([]),
  ])
  const adminNames = new Map(admins.map((u) => [u._id.toString(), u.name as string]))
  const inviteeNames = new Map(invitees.map((u) => [u.email as string, u.name as string]))

  return mapped.map((invite) => ({
    ...invite,
    invitedByName: adminNames.get(invite.invitedBy) ?? invite.invitedByName,
    inviteeName: inviteeNames.get(invite.email) ?? undefined,
  }))
}

function mapInvite(doc: any): Invite | null {
  if (!doc) return null
  return {
    id: doc._id.toString(),
    email: doc.email,
    role: doc.role,
    token: doc.token,
    invitedBy: doc.invitedBy?.toString() ?? '',
    projectId: doc.projectId?.toString() ?? undefined,
    firstName: doc.firstName ?? undefined,
    lastName: doc.lastName ?? undefined,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    acceptedAt: doc.acceptedAt,
  }
}


