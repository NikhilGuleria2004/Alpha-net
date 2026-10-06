import { getDb } from '../lib/mongodb.js'
import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import { sendInviteEmail, emailEnabled } from '../lib/email.js'
import type { CreateOnboardingInput, OnboardingCandidate, OnboardingPipeline, OnboardingStage } from '../types/people.js'
import type { SupportedCurrencyCode, UserRole } from '../types/auth.js'

const DOCUMENTS_TOTAL_DEFAULT = 3
const INVITE_TOKEN_BYTES = 32
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

export async function createOnboardingCandidate(input: CreateOnboardingInput, requesterId: string): Promise<OnboardingCandidate> {
  const db = await getDb()
  const now = new Date()

  // Check for an active (non-deleted) duplicate. Deleted candidates are
  // excluded so an HR can re-invite an email that was previously withdrawn —
  // the delete is soft (a `deletedAt` flag), so without this guard the old
  // row would still trip the email-uniqueness check and block re-invitation.
  const existing = await db.collection(COLLECTIONS.ONBOARDING_CANDIDATES).findOne({
    deletedAt: { $exists: false },
    $or: [{ email: input.email.toLowerCase() }, { employeeId: input.employeeId }],
  })
  if (existing) {
    throw new Error('Candidate with this email or employee ID already exists in the pipeline')
  }

  // Billable guardrail (§6.3): billable=true requires payRate > 0 + currency
  if (input.billable === true && !(input.payRate && input.payRate > 0 && input.currency)) {
    const err: any = new Error('Set a pay rate and currency before marking this resource billable')
    err.code = 'BILLABLE_WITHOUT_RATE'
    throw err
  }

   // Issue an invite token at creation so the candidate's work email receives a
   // sign-up link (EMS §7.1). The token is stored hashed (never the raw value)
   // and the email is dispatched best-effort: a delivery failure must not block
   // the candidate from being created in the pipeline.
   const inviteToken = crypto.randomBytes(INVITE_TOKEN_BYTES).toString('hex')
   const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex')
   const inviteExpiresAt = new Date(now.getTime() + INVITE_EXPIRY_MS)

   const result = await db.collection(COLLECTIONS.ONBOARDING_CANDIDATES).insertOne({
     name: input.name,
     email: input.email.toLowerCase(),
     employeeId: input.employeeId,
     department: input.department,
     role: input.role,
     stage: 'invited' as OnboardingStage,
     invitedAt: now.toISOString(),
     documentsUploaded: 0,
     documentsTotal: DOCUMENTS_TOTAL_DEFAULT,
     payRate: input.billable ? input.payRate ?? null : null,
     currency: input.billable ? input.currency ?? 'USD' : undefined,
     invitedBy: requesterId,
     inviteTokenHash,
     inviteExpiresAt,
     inviteSentAt: now,
     createdAt: now,
     updatedAt: now,
   })

   await createActivity({
     userId: requesterId,
     description: `Onboarding candidate created: ${input.email.toLowerCase()}`,
     entityType: 'onboarding_candidate',
     entityId: result.insertedId.toString(),
   })

   // Deliver the invite to the candidate's work email. This is best-effort and
   // MUST NOT block the create response — a slow/hanging MTA would otherwise
   // freeze the whole POST (observed: Gmail SMTP over a blackholed 587 stalls
   // `sendInviteEmail` indefinitely). The token is persisted regardless so the
   // invite can be re-sent later; delivery failures are logged here, not raised.
   if (emailEnabled()) {
     void sendInviteEmail(input.email.toLowerCase(), inviteToken).catch((err) => {
       logger.warn({ err, candidateEmail: input.email.toLowerCase() }, 'invite email delivery failed; candidate created regardless')
     })
   } else {
     logger.info(
       { candidateEmail: input.email.toLowerCase() },
       'invite email not dispatched (SMTP not configured); token stored for retry',
     )
   }

   logger.info({ requesterId, candidateEmail: input.email.toLowerCase() }, 'onboarding candidate created')

   return {
     id: result.insertedId.toString(),
     name: input.name,
     email: input.email.toLowerCase(),
     employeeId: input.employeeId,
     department: input.department,
     role: input.role as UserRole,
     stage: 'invited',
     invitedAt: now.toISOString(),
     documentsUploaded: 0,
     documentsTotal: DOCUMENTS_TOTAL_DEFAULT,
     payRate: input.billable ? input.payRate ?? null : null,
     currency: input.billable ? input.currency ?? 'USD' : undefined,
     inviteTokenHash,
     inviteExpiresAt: inviteExpiresAt.toISOString(),
     inviteSentAt: now.toISOString(),
   }
 }

export async function getOnboardingPipeline(): Promise<{ pipeline: OnboardingPipeline; candidates: OnboardingCandidate[] }> {
  const db = await getDb()

  // Soft-deleted candidates are excluded from the pipeline: a withdrawn
  // invite must not still count against the stage totals or appear in the
  // board.
  const notDeleted = { deletedAt: { $exists: false } }
  const [pipelineAgg, candidatesRaw] = await Promise.all([
    db
      .collection(COLLECTIONS.ONBOARDING_CANDIDATES)
      .aggregate([
        { $match: notDeleted },
        { $group: { _id: '$stage', count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection(COLLECTIONS.ONBOARDING_CANDIDATES)
      .find(notDeleted)
      .sort({ createdAt: -1 })
      .toArray(),
  ])

  const pipeline: OnboardingPipeline = {
    invited: 0,
    docsPending: 0,
    payratePending: 0,
    ready: 0,
    active: 0,
  }

  for (const p of pipelineAgg) {
    switch (p._id) {
      case 'invited':
        pipeline.invited = p.count
        break
      case 'docs_pending':
        pipeline.docsPending = p.count
        break
      case 'payrate_pending':
        pipeline.payratePending = p.count
        break
      case 'ready':
        pipeline.ready = p.count
        break
      case 'active':
        pipeline.active = p.count
        break
    }
  }

  const candidates: OnboardingCandidate[] = candidatesRaw.map((c) => ({
    id: c._id.toString(),
    name: c.name || '',
    email: c.email || '',
    employeeId: c.employeeId || '',
    department: c.department,
    role: c.role,
    stage: (c.stage as OnboardingStage) || 'invited',
    invitedAt: c.invitedAt || c.createdAt?.toISOString(),
    startedAt: c.startedAt,
    invitedBy: c.invitedBy,
    documentsUploaded: c.documentsUploaded ?? 0,
    documentsTotal: c.documentsTotal ?? DOCUMENTS_TOTAL_DEFAULT,
    payRate: c.payRate ?? null,
    currency: c.currency as SupportedCurrencyCode | undefined,
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : undefined,
    deletedBy: c.deletedBy ? String(c.deletedBy) : undefined,
  }))

  return { pipeline, candidates }
}

/**
 * Flow Integration Phase 5 — soft-delete an onboarding candidate (an
 * invite that hasn't converted to an employee yet).
 *
 * The delete is SOFT (a `deletedAt` + `deletedBy` stamp) on purpose:
 * this service and the platform's share the `onboarding_candidates`
 * collection, the onboarding flow is auditable everywhere, and a
 * hard delete would make a withdrawn invite irrecoverable. Soft-deleting
 * also frees the candidate's email for re-invitation — `createOnboarding`
 * and `getOnboardingPipeline` both exclude `deletedAt` documents, so the
 * email immediately becomes available for a new invite and stops counting
 * against the pipeline totals.
 *
 * A candidate in the `active` stage has already been hired: their user
 * record is authoritative and the onboarding row is now linkage
 * evidence, so it is refused with a descriptive error instead.
 */
export async function deleteOnboardingCandidate(
  candidateId: string,
  requesterId: string,
): Promise<{ deletedId: string; stage: OnboardingStage }> {
  const db = await getDb()

  if (!ObjectId.isValid(candidateId)) {
    throw new Error('Invalid candidate id')
  }

  const filter = { _id: new ObjectId(candidateId) }
  const existing = await db
    .collection(COLLECTIONS.ONBOARDING_CANDIDATES)
    .findOne(filter)
  if (!existing) {
    throw new Error('Onboarding candidate not found')
  }
  // Idempotency: re-deleting a withdrawn invite reports Gone rather
  // than silently succeeding or 404ing.
  if (existing.deletedAt) {
    throw new Error('Onboarding candidate already deleted')
  }
  // Refuse to delete someone already hired. Deleting an active
  // candidate would orphan the employee record it references — the
  // email/stage are locked to a user account now.
  if (existing.stage === 'active') {
    throw new Error(
      'Candidate is already hired — remove the employee record instead',
    )
  }

  await db
    .collection(COLLECTIONS.ONBOARDING_CANDIDATES)
    .updateOne(
      filter,
      {
        $set: {
          deletedAt: new Date(),
          deletedBy: requesterId,
          updatedAt: new Date(),
        },
      },
    )

  await createActivity({
    userId: requesterId,
    description: `Onboarding candidate deleted: ${existing.email ?? ''}`,
    entityType: 'onboarding_candidate',
    entityId: candidateId,
  })

  return { deletedId: candidateId, stage: existing.stage as OnboardingStage }
}
