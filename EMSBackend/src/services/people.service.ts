import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { resolveEmsRole } from '../lib/role.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import { signAccessToken } from '../lib/jwt.js'
import { canDemoteAdmin, canDeactivateUser } from './capabilities.js'
import { toEmsDocument } from './document.service.js'
import type { CreateEmployeeInput, UpdateEmployeeInput, PayRateHistoryEntry } from '../types/people.js'
import type { EmsDocument } from '../types/document.js'
import type { EmsUser } from '../types/auth.js'

const DEFAULT_DEPARTMENTS = ['Engineering', 'People Ops', 'Delivery', 'Design', 'Platform']

export async function listEmployees(query?: { q?: string; department?: string; role?: string }): Promise<{ users: EmsUser[]; total: number }> {
  const db = await getDb()
  const filter: Record<string, unknown> = { status: { $in: ['active', 'invited', 'on_leave'] } }

  if (query?.q) {
    const q = query.q.toLowerCase()
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { employeeId: { $regex: q, $options: 'i' } },
    ]
  }
  if (query?.department) {
    filter.department = query.department
  }
  if (query?.role) {
    filter.role = query.role
  }

  const users = await db
    .collection(COLLECTIONS.USERS)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray()

  return {
    users: users.map(toEmsUser),
    total: users.length,
  }
}

export async function createEmployee(input: CreateEmployeeInput, requesterId: string): Promise<{ user: EmsUser; accessToken: string }> {
  const db = await getDb()
  const now = new Date()

  // Billable guardrail (§6.3)
  if (input.billable === true && !(input.payRate && input.payRate > 0 && input.currency)) {
    const err: any = new Error('Set a pay rate and currency before marking this resource billable')
    err.code = 'BILLABLE_WITHOUT_RATE'
    throw err
  }

  // Check for duplicate email or employeeId
  const existing = await db.collection(COLLECTIONS.USERS).findOne({
    $or: [{ email: input.email.toLowerCase() }, { employeeId: input.employeeId }],
  })
  if (existing) {
    throw new Error('Employee with this email or employee ID already exists')
  }

  // Validate the manager and the reporting-line reference exist
  if (input.managerId) {
    const manager = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(input.managerId) })
    if (!manager) throw new Error('Manager not found')
  }
  if (input.supervisorId) {
    const supervisor = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(input.supervisorId) })
    if (!supervisor) throw new Error('Reporting line not found')
  }

  const doc = {
    name: input.name,
    email: input.email.toLowerCase(),
    employeeId: input.employeeId,
    department: input.department,
    role: input.role,
    emsRole: input.role,
    title: input.title,
    employmentType: input.employmentType ?? 'full_time',
    status: 'invited' as const,
    billable: input.billable ?? false,
    payRate: input.billable ? input.payRate ?? null : null,
    currency: input.billable ? input.currency ?? 'USD' : 'USD',
    managerId: input.managerId ? new ObjectId(input.managerId) : undefined,
    supervisorId: input.supervisorId ? new ObjectId(input.supervisorId) : undefined,
    startDate: input.startDate,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection(COLLECTIONS.USERS).insertOne(doc)
  const userOid = result.insertedId

  // Write initial payrate history entry
  if (input.payRate && input.payRate > 0) {
    await db.collection(COLLECTIONS.PAYRATE_HISTORY).insertOne({
      userId: userOid,
      oldRate: null,
      newRate: input.payRate,
      currency: input.currency ?? 'USD',
      reason: 'Initial hire',
      changedBy: requesterId,
      createdAt: now,
    })
  }

  // Ensure department is tracked
  await syncDepartment(input.department, db)

  await createActivity({
    userId: requesterId,
    description: `Employee created: ${input.email.toLowerCase()}`,
    entityType: 'user',
    entityId: userOid.toString(),
  })

  const userDoc = { ...doc, _id: userOid }
  const accessToken = await signAccessToken({
    userId: userOid.toString(),
    role: input.role,
    billable: input.billable ?? false,
  })

  logger.info({ requesterId, employeeId: input.employeeId }, 'employee created')

  return {
    user: toEmsUser(userDoc),
    accessToken,
  }
}

export async function getEmployeeDetail(id: string): Promise<{ user: EmsUser; payrateHistory: PayRateHistoryEntry[]; documents: EmsDocument[] }> {
  const db = await getDb()

  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) })
  if (!user) {
    throw new Error('Employee not found')
  }

  const [payrateHistoryRaw, documents] = await Promise.all([
    db
      .collection(COLLECTIONS.PAYRATE_HISTORY)
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .toArray(),
    db.collection(COLLECTIONS.DOCUMENTS).find({ userId: user._id }).toArray(),
  ])

  const payrateHistory: PayRateHistoryEntry[] = payrateHistoryRaw.map((p) => ({
    id: p._id.toString(),
    userId: p.userId?.toString() || '',
    employeeName: user.name || '',
    employeeId: user.employeeId || '',
    oldRate: p.oldRate ?? null,
    newRate: p.newRate || 0,
    currency: (p.currency as any) || 'USD',
    reason: p.reason,
    changedBy: p.changedBy || '',
    createdAt: p.createdAt?.toISOString() || '',
  }))

  return {
    user: toEmsUser(user),
    payrateHistory,
    // Shape documents as EmsDocument rather than leaking raw Mongo rows.
    documents: documents.map((doc: Record<string, any>) => toEmsDocument(doc)),
  }
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
  requester: EmsUser,
  allActiveUsers: EmsUser[],
): Promise<{ user: EmsUser }> {
  const db = await getDb()
  const now = new Date()

  const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) })
  if (!user) {
    throw new Error('Employee not found')
  }

  // Last-admin guardrail (§6.5): can't deactivate or demote the last active admin
  const isDemotingFromAdmin = resolveEmsRole(user) === 'admin' && input.role && input.role !== 'admin'
  const isDeactivating = input.status === 'inactive' || input.status === 'deactivated'

  if (isDeactivating || isDemotingFromAdmin) {
    const target = toEmsUser(user)
    const guardrail = isDeactivating
      ? canDeactivateUser(requester, target, allActiveUsers)
      : canDemoteAdmin(target, allActiveUsers)

    if (!guardrail.ok) {
      const err: any = new Error(guardrail.error)
      err.code = guardrail.code
      throw err
    }
  }

  const update: Record<string, unknown> = { updatedAt: now }
  if (input.name) update.name = input.name
  if (input.department) update.department = input.department
  if (input.title) update.title = input.title
  if (input.employmentType) update.employmentType = input.employmentType
  if (input.billable !== undefined) update.billable = input.billable
  if (input.currency) update.currency = input.currency
  if (input.managerId) update.managerId = new ObjectId(input.managerId)
  if (input.supervisorId) update.supervisorId = new ObjectId(input.supervisorId)
  if (input.startDate) update.startDate = input.startDate
  if (input.status) update.status = input.status
  if (input.role) {
    // Write `emsRole`, NOT `role`. `role` is shared with the platform, which
    // validates it against z.enum(['admin','user']) on its own write paths;
    // persisting an EMS-only value there produces rows the platform cannot
    // write back. Resolution prefers `emsRole`, so the change still takes
    // effect immediately for EMS. See D-19.
    update.emsRole = input.role
    // NOTE: `isSupervisor` is deliberately NOT written here. It is a
    // platform-owned flag that the timesheet platform authorizes against
    // (`canSuperviseUser`), and EMS must never mutate it — a blanket
    // `isSupervisor = false` on every role edit would silently revoke
    // supervisor rights in the other service. See D-21.
  }

  // Billable guardrail (§6.3): if billable is explicitly set to true, ensure payRate > 0 and currency
  if (input.billable === true && !(user.payRate && user.payRate > 0 && user.currency) && !(input.payRate && input.payRate > 0 && input.currency)) {
    const err: any = new Error('Set a pay rate and currency before marking this resource billable')
    err.code = 'BILLABLE_WITHOUT_RATE'
    throw err
  }

  // PayRate -> history dual-write (§7.5)
  if (input.payRate !== undefined) {
    const oldRate = user.payRate ?? null
    if (oldRate !== input.payRate) {
      await db.collection(COLLECTIONS.PAYRATE_HISTORY).insertOne({
        userId: new ObjectId(id),
        oldRate,
        newRate: input.payRate,
        currency: input.currency ?? user.currency ?? 'USD',
        reason: 'Manual update',
        changedBy: requester.name || requester.id,
        createdAt: now,
      })
      update.payRate = input.payRate
    }
  }

  await db.collection(COLLECTIONS.USERS).updateOne({ _id: new ObjectId(id) }, { $set: update })

  const updated = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(id) })

  await createActivity({
    userId: requester.id || '',
    description: `Employee updated: ${id}`,
    entityType: 'user',
    entityId: id,
  })

  logger.info({ requesterId: requester.id, employeeId: id }, 'employee updated')

  return { user: toEmsUser(updated!) }
}

export async function listDepartments(): Promise<{ departments: string[] }> {
  const db = await getDb()

  const results = await db.collection(COLLECTIONS.DEPARTMENTS).find({}).toArray()
  const seeded = await db.collection(COLLECTIONS.USERS).distinct('department')

  const allDepts = [...new Set([...results.map((d) => d.name), ...seeded.filter(Boolean), ...DEFAULT_DEPARTMENTS])]

  return { departments: allDepts }
}

export async function createDepartment(name: string, requesterId: string): Promise<{ department: string }> {
  const db = await getDb()

  await db
    .collection(COLLECTIONS.DEPARTMENTS)
    .updateOne({ name }, { $setOnInsert: { name, createdAt: new Date(), createdBy: requesterId } }, { upsert: true })

  await createActivity({
    userId: requesterId,
    description: `Department created: ${name}`,
    entityType: 'department',
  })

  return { department: name }
}

export async function getPayrateHistory(userId?: string): Promise<PayRateHistoryEntry[]> {
  const db = await getDb()

  const filter: Record<string, unknown> = {}
  if (userId) {
    filter.userId = new ObjectId(userId)
  }

  const results = await db
    .collection(COLLECTIONS.PAYRATE_HISTORY)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray()

  const userIds = [...new Set(results.map((r) => r.userId?.toString()).filter(Boolean))]
  const users = await db
    .collection(COLLECTIONS.USERS)
    .find({ _id: { $in: userIds.map((u) => new ObjectId(u)) } })
    .toArray()
  const userMap = new Map(users.map((u) => [u._id.toString(), u]))

  return results.map((r) => {
    const user = userMap.get(r.userId?.toString() || '')
    return {
      id: r._id.toString(),
      userId: r.userId?.toString() || '',
      employeeName: user?.name || '',
      employeeId: user?.employeeId || '',
      oldRate: r.oldRate ?? null,
      newRate: r.newRate || 0,
      currency: (r.currency as any) || 'USD',
      reason: r.reason,
      changedBy: r.changedBy || '',
      createdAt: r.createdAt?.toISOString() || '',
    }
  })
}

function toEmsUser(doc: any): EmsUser {
  return {
    id: doc._id.toString(),
    name: doc.name || '',
    email: doc.email || '',
    role: resolveEmsRole(doc),
    employeeId: doc.employeeId || '',
    department: doc.department,
    title: doc.title,
    status: (doc.status as any) || 'active',
    billable: doc.billable ?? false,
    payRate: doc.payRate ?? null,
    currency: doc.currency,
    employmentType: doc.employmentType,
    managerId: doc.managerId?.toString(),
    supervisorId: doc.supervisorId?.toString(),
    avatarUrl: doc.avatarUrl,
    joinedAt: toDay(doc.startDate) ?? toDay(doc.createdAt),
    // Tolerant of both BSON Dates and ISO strings: the shared `users`
    // collection is written by the platform too, and a row holding a string
    // timestamp must not 500 the whole directory listing.
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  }
}

/** Coerce a Date, an ISO string, or junk into a Date — undefined if unusable. */
function toDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const date = value instanceof Date ? value : new Date(value as string)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** `YYYY-MM-DD` for a Date or date-ish string — undefined if unusable. */
function toDay(value: unknown): string | undefined {
  return toDate(value)?.toISOString().slice(0, 10)
}

/** ISO string for a Date or date-ish string — undefined if unusable. */
function toIso(value: unknown): string | undefined {
  return toDate(value)?.toISOString()
}

async function syncDepartment(name: string, db: any): Promise<void> {
  await db
    .collection(COLLECTIONS.DEPARTMENTS)
    .updateOne(
      { name },
      { $setOnInsert: { name, createdAt: new Date() } },
      { upsert: true },
    )
}

export { DEFAULT_DEPARTMENTS, toEmsUser }
