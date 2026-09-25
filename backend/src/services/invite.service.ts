import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId, type Db } from 'mongodb'
import crypto from 'node:crypto'
import { createActivity } from './activity.service.js'
import { hashPassword } from './auth.service.js'
import { createNotification } from './notification.service.js'
import { parseObjectId, tryParseObjectId } from '../lib/objectid.js'
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
  employeeId?: string
  department?: string
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
  const userId = userResult.insertedId

  const inviteDoc = {
    email: input.email.toLowerCase().trim(),
    role: input.role,
    token,
    invitedBy: parseObjectId(input.invitedBy),
    projectId: input.projectId ? parseObjectId(input.projectId) : null,
    userId,
    // Keep a copy of the onboarding profile on the invite itself. The
    // pre-created user row can be deleted while the invite is still pending, and
    // without this copy the invitee's real name/employee ID/department would be
    // gone for good — `resolveInviteUser` self-heals the row from these fields,
    // so activation used to end up with the "User <email>" placeholder.
    firstName,
    lastName,
    employeeId: input.employeeId?.trim() ?? '',
    department: input.department?.trim() ?? '',
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

/**
 * Resolve the invitee row an invite points at, repairing the dangling-reference
 * case while we are at it.
 *
 * `createInvite` pre-creates the row with status 'invited', but an invite can
 * outlive it: legacy invites stored `userId` as a string, and an invited row can
 * be deleted out from under a still-pending invite. Both used to hard-fail
 * activation with a 400 ("Invalid or expired invite token"), which reads as a
 * bad link to the invitee even though the token is perfectly good.
 *
 * Resolution order:
 *   1. the invite's `userId` (ObjectId or legacy string),
 *   2. an exact email match on the invite — covers a deleted/renamed row and a
 *      user who already exists under a different `_id`,
 *   3. re-create the missing row from the invite (self-heal).
 *
 * Returns null only when the invite carries no usable identity at all.
 */
async function resolveInviteUser(db: Db, invite: any): Promise<{ user: any; userId: ObjectId } | null> {
  const users = db.collection(COLLECTIONS.USERS)

  const referencedId = tryParseObjectId(invite.userId)
  if (referencedId) {
    const byId = await users.findOne({ _id: referencedId })
    if (byId) {
      return { user: byId, userId: byId._id as ObjectId }
    }
  }

  const email = typeof invite.email === 'string' ? invite.email.toLowerCase().trim() : ''
  if (!email) {
    return null
  }

  const byEmail = await users.findOne({ email })
  if (byEmail) {
    return { user: byEmail, userId: byEmail._id as ObjectId }
  }

  // The invited row is gone — rebuild it so activation can still complete. The
  // invite's role/project stay authoritative; the profile fields it captured are
  // restored when present and otherwise supplied by the redeem form.
  const { role, isSupervisor } = roleFlags(invite.role)
  const now = new Date()
  const userDoc = {
    _id: referencedId ?? new ObjectId(),
    name: composeName(invite.firstName, invite.lastName),
    firstName: invite.firstName?.trim() ?? '',
    lastName: invite.lastName?.trim() ?? '',
    email,
    employeeId: invite.employeeId?.trim() ?? '',
    department: invite.department?.trim() ?? '',
    role,
    isSupervisor,
    status: 'invited' as const,
    supervisorId: null,
    passwordHash: '',
    createdAt: now,
    updatedAt: now,
  }

  try {
    await users.insertOne(userDoc)
  } catch (err) {
    // Unique email index under a concurrent redeem — adopt whatever won the race.
    const raced = await users.findOne({ email })
    if (raced) {
      return { user: raced, userId: raced._id as ObjectId }
    }
    logger.warn({ err, email }, 'failed to recreate missing invitee user row')
    return null
  }

  logger.warn(
    { email, userId: userDoc._id.toString() },
    'recreated missing invitee user row on redeem (invite outlived its user)',
  )

  return { user: userDoc, userId: userDoc._id }
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

  // Find (or repair) the user associated with this invite: tolerates both
  // ObjectId and legacy string ids, plus a deleted-but-still-referenced row.
  const resolved = await resolveInviteUser(db, invite)
  if (!resolved) {
    return { user: null, invite: null }
  }
  const { user, userId: userObjectId } = resolved

  // Set password, activate, and apply any profile details the invitee
  // completed on the redeem form (first/last name, employee ID, department).
  // Resolution order: redeem form → the user row → the invite's own copy of the
  // onboarding profile (covers a row that was re-created without a profile, so
  // the name captured at invite time is never silently dropped in favour of the
  // "User <email>" placeholder).
  const firstName = input.firstName?.trim() || user.firstName?.trim() || invite.firstName?.trim() || ''
  const lastName = input.lastName?.trim() || user.lastName?.trim() || invite.lastName?.trim() || ''
  const employeeId = input.employeeId?.trim() || user.employeeId?.trim() || invite.employeeId?.trim() || ''
  const department = input.department?.trim() || user.department?.trim() || invite.department?.trim() || ''
  const name = composeName(firstName, lastName) || user.name?.trim() || `User ${user.email}`
  const passwordHash = await hashPassword(input.password)
  await db.collection(COLLECTIONS.USERS).updateOne(
    { _id: userObjectId },
    {
      $set: {
        name,
        firstName,
        lastName,
        employeeId,
        department,
        passwordHash,
        status: 'active',
        updatedAt: now,
      },
    },
  )

  // If the invite carried a project assignment, put the new user on the team.
  const projectObjectId = tryParseObjectId(invite.projectId)
  if (projectObjectId) {
    const project = await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: projectObjectId })
    if (project) {
      await db.collection(COLLECTIONS.PROJECTS).updateOne(
        { _id: projectObjectId },
        { $addToSet: { teamMemberIds: userObjectId } },
      )
    }
  }

  // Mark invite as accepted
  await db.collection(COLLECTIONS.INVITES).updateOne(
    { _id: invite._id },
    { $set: { acceptedAt: now } },
  )

  await createActivity({
    userId: userObjectId.toString(),
    description: `Account activated via invite.`,
  })

  // Send welcome notification
  try {
    await createNotification({
      userId: userObjectId.toString(),
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
      name,
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
    employeeId: doc.employeeId ?? undefined,
    department: doc.department ?? undefined,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    acceptedAt: doc.acceptedAt,
  }
}


