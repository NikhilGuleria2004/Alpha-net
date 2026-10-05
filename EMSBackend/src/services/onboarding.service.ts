import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import type { CreateOnboardingInput, OnboardingCandidate, OnboardingPipeline, OnboardingStage } from '../types/people.js'
import type { SupportedCurrencyCode, UserRole } from '../types/auth.js'

const DOCUMENTS_TOTAL_DEFAULT = 3

export async function createOnboardingCandidate(input: CreateOnboardingInput, requesterId: string): Promise<OnboardingCandidate> {
  const db = await getDb()
  const now = new Date()

  // Check for duplicate email or employeeId
  const existing = await db.collection(COLLECTIONS.ONBOARDING_CANDIDATES).findOne({
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
    createdAt: now,
    updatedAt: now,
  })

  await createActivity({
    userId: requesterId,
    description: `Onboarding candidate created: ${input.email.toLowerCase()}`,
    entityType: 'onboarding_candidate',
    entityId: result.insertedId.toString(),
  })

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
  }
}

export async function getOnboardingPipeline(): Promise<{ pipeline: OnboardingPipeline; candidates: OnboardingCandidate[] }> {
  const db = await getDb()

  const [pipelineAgg, candidatesRaw] = await Promise.all([
    db
      .collection(COLLECTIONS.ONBOARDING_CANDIDATES)
      .aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }])
      .toArray(),
    db.collection(COLLECTIONS.ONBOARDING_CANDIDATES).find({}).sort({ createdAt: -1 }).toArray(),
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
  }))

  return { pipeline, candidates }
}
