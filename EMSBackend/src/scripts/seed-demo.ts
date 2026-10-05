/**
 * seed:demo — mirrors EMSFrontend/src/mocks/fixtures*.ts into MongoDB.
 *
 * Phase 8, task 8.1 (mock-parity). Goal: flipping the frontend to
 * `VITE_USE_MOCK=false` shows the SAME people, clients, projects and numbers the
 * mock screens showed, so a mock-to-real diff is a visual check rather than an
 * investigation. Names, emails, employeeIds, client codes and SOW numbers are
 * therefore hard-coded below rather than generated.
 *
 * Deliberately NOT an exact aggregate match: the fixtures' own hours are
 * internally inconsistent (MOCK_HOURS_BY_PROJECT sums to 412 while
 * MOCK_HOURS_BY_EMPLOYEE sums to 388), so no single timesheet set can reproduce
 * both. The seeded timesheets produce close, deterministic, non-zero numbers.
 *
 * Safe to re-run: every write is an upsert keyed on the fixture's natural key
 * (email, employeeId, clientCode, sowNumber...), never a blind insert.
 *
 * Usage: npm run seed:demo        (add --reset to wipe the demo rows first)
 */
import 'dotenv/config'
import { ObjectId } from 'mongodb'
import { getDb, closeDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ensureIndexes } from '../lib/collections.js'
import { seedLeaveTypes } from '../services/leave.service.js'
import { hashPassword } from '../services/auth.service.js'
import { logger } from '../lib/logger.js'

/** Fixture "now" — keeps seeded timestamps aligned with the mock screens. */
const NOW = new Date('2026-09-30T08:15:00.000Z')
const MOCK_TODAY = '2026-09-30'

/** Demo password for every seeded account. Documented in the README. */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'EniacDemo!2026'

/**
 * Timestamp helper. Returns a real BSON Date, NOT an ISO string: `createdAt` /
 * `weekStart`-adjacent fields are range-queried and TTL-indexed, and a string
 * there silently breaks both comparisons and `toISOString()` in the mappers.
 */
const ts = (value: string) => new Date(value)

// ── users (fixtures.ts MOCK_USERS) ───────────────────────────────────────────

const USERS = [
  {
    key: 'u-admin',
    name: 'Aarav Admin',
    email: 'admin@eniac.demo',
    employeeId: 'E000001',
    role: 'admin',
    department: 'Platform',
    billable: false,
    title: undefined as string | undefined,
  },
  {
    key: 'u-hr',
    name: 'Hina Rao',
    email: 'hr@eniac.demo',
    employeeId: 'E000002',
    role: 'hr',
    department: 'People Ops',
    billable: false,
    title: 'HR Partner',
  },
  {
    key: 'u-manager',
    name: 'Meera Manager',
    email: 'manager@eniac.demo',
    employeeId: 'E000003',
    role: 'manager',
    department: 'Delivery',
    billable: false,
    title: 'Delivery Manager',
  },
  {
    key: 'u-emp1',
    name: 'Esha Employee',
    email: 'esha@eniac.demo',
    employeeId: 'E000101',
    role: 'employee',
    department: 'Engineering',
    billable: true,
    payRate: 85,
    title: 'Frontend Engineer',
  },
  {
    key: 'u-emp2',
    name: 'Dev Contractor',
    email: 'dev@eniac.demo',
    employeeId: 'E000102',
    role: 'employee',
    department: 'Engineering',
    billable: true,
    payRate: 95,
    employmentType: 'contract',
    title: 'Backend Engineer',
  },
]

// ── clients (fixtures.ts MOCK_CLIENTS) ────────────────────────────────────────

const CLIENTS = [
  {
    code: 'CL-2026-001',
    name: 'Acme Corp',
    normalizedName: 'acme corp',
    description: 'Retail chain with 45 stores nationwide; flagship customer portal modernization.',
    paymentTerms: 'Net 30',
    contactEmail: 'ap@acme.example',
    contractValue: 87500,
  },
  {
    code: 'CL-2026-002',
    name: 'Globex',
    normalizedName: 'globex',
    description: 'Manufacturing conglomerate; 3-year ledger migration program.',
    contactEmail: 'billing@globex.example',
    contractValue: 42300,
  },
  {
    code: 'CL-2026-003',
    name: 'Initech LLC',
    normalizedName: 'initech llc',
    contractValue: 18000,
  },
]

const CLIENT_CONTACTS: Record<string, Array<{ name: string; email: string; phone: string }>> = {
  'CL-2026-001': [{ name: 'Alice Smith', email: 'alice@acme.example', phone: '+1 555 0101' }],
  'CL-2026-002': [{ name: 'Bob Jones', email: 'bob@globex.example', phone: '+1 555 0102' }],
  'CL-2026-003': [{ name: 'Carol White', email: 'carol@initech.example', phone: '+1 555 0103' }],
}

const CLIENT_ACTIVITY = [
  { clientCode: 'CL-2026-001', description: 'Project "Acme Portal Revamp" created', actorKey: 'u-manager', createdAt: ts('2026-09-01T10:00:00Z'), entityType: 'project' },
  { clientCode: 'CL-2026-003', description: 'Client CL-2026-003 synced to timesheet platform', actorKey: 'u-admin', createdAt: ts('2026-09-29T16:30:00Z'), entityType: 'client' },
  { clientCode: 'CL-2026-001', description: 'SOW-2026-014 updated (PO cap raised)', actorKey: 'u-manager', createdAt: ts('2026-09-15T14:00:00Z'), entityType: 'project' },
]

// ── projects (fixtures.ts MOCK_PROJECTS) ─────────────────────────────────────

const PROJECTS = [
  {
    sowNumber: 'SOW-2026-014',
    name: 'Acme Portal Revamp',
    clientCode: 'CL-2026-001',
    description: 'Customer portal modernization.',
    startDate: '2026-07-01',
    endDate: '2026-12-31',
    deadline: '2026-12-15',
    status: 'active',
    hourlyRate: 140,
    seats: 2,
    managerKey: 'u-manager',
    teamKeys: ['u-emp1', 'u-emp2'],
  },
  {
    sowNumber: 'SOW-2026-021',
    name: 'Globex Ledger',
    clientCode: 'CL-2026-002',
    description: 'Billing ledger migration.',
    startDate: '2026-08-15',
    endDate: '2026-11-30',
    deadline: '2026-11-20',
    status: 'active',
    hourlyRate: 130,
    seats: 1,
    managerKey: 'u-manager',
    teamKeys: ['u-emp1'],
  },
]

// ── assignments (fixtures.ts MOCK_ASSIGNMENTS) ───────────────────────────────

const ASSIGNMENTS = [
  {
    userKey: 'u-emp1',
    sowNumber: 'SOW-2026-014',
    billRate: 140,
    payRate: 85,
    ftePercent: 100,
    roleOnProject: 'Frontend Engineer',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    status: 'active',
  },
  {
    userKey: 'u-emp2',
    sowNumber: 'SOW-2026-014',
    billRate: 150,
    payRate: 95,
    ftePercent: 100,
    roleOnProject: 'Backend Engineer',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    status: 'active',
  },
  {
    userKey: 'u-emp1',
    sowNumber: 'SOW-2026-021',
    billRate: 130,
    payRate: 85,
    ftePercent: 50,
    roleOnProject: 'Frontend Engineer',
    startDate: '2026-09-15',
    endDate: '2026-11-30',
    status: 'active',
  },
]

/** Weekly timesheets feeding payroll + reports. Weeks are inside 2026-09. */
const TIMESHEETS = [
  { userKey: 'u-emp1', sowNumber: 'SOW-2026-014', weekStart: '2026-09-07', regularHours: 40, overtimeHours: 0, status: 'approved' },
  { userKey: 'u-emp1', sowNumber: 'SOW-2026-014', weekStart: '2026-09-14', regularHours: 40, overtimeHours: 0, status: 'approved' },
  { userKey: 'u-emp1', sowNumber: 'SOW-2026-014', weekStart: '2026-09-21', regularHours: 40, overtimeHours: 4, status: 'approved' },
  { userKey: 'u-emp1', sowNumber: 'SOW-2026-021', weekStart: '2026-09-14', regularHours: 20, overtimeHours: 0, status: 'approved' },
  { userKey: 'u-emp1', sowNumber: 'SOW-2026-021', weekStart: '2026-09-21', regularHours: 20, overtimeHours: 0, status: 'pending' },
  { userKey: 'u-emp2', sowNumber: 'SOW-2026-014', weekStart: '2026-09-07', regularHours: 40, overtimeHours: 0, status: 'approved' },
  { userKey: 'u-emp2', sowNumber: 'SOW-2026-014', weekStart: '2026-09-14', regularHours: 40, overtimeHours: 2, status: 'approved' },
  { userKey: 'u-emp2', sowNumber: 'SOW-2026-014', weekStart: '2026-09-21', regularHours: 40, overtimeHours: 0, status: 'draft' },
]

// ── HR fixtures (fixtures2.ts MOCK_LEAVE_REQUESTS / PAYRATE / DOCUMENTS) ─────

const LEAVE_REQUESTS = [
  { userKey: 'u-emp1', type: 'vacation', startDate: '2026-10-05', endDate: '2026-10-07', days: 3, status: 'pending', reason: 'Family trip', submittedAt: ts('2026-10-01T09:30:00Z'), note: 'Will catch up on emails.' },
  { userKey: 'u-emp1', type: 'sick', startDate: '2026-09-28', endDate: '2026-09-28', days: 1, status: 'approved', submittedAt: ts('2026-09-25T10:00:00Z'), reviewerKey: 'u-manager', reviewedAt: ts('2026-09-25T14:00:00Z') },
  { userKey: 'u-emp2', type: 'vacation', startDate: '2026-10-12', endDate: '2026-10-16', days: 5, status: 'pending', submittedAt: ts('2026-10-02T08:00:00Z') },
  { userKey: 'u-emp2', type: 'personal', startDate: '2026-09-30', endDate: '2026-09-30', days: 1, status: 'rejected', submittedAt: ts('2026-09-28T16:00:00Z'), reviewerKey: 'u-manager', reviewedAt: ts('2026-09-29T09:00:00Z'), note: 'Coverage gap' },
]

const PAYRATE_HISTORY = [
  { userKey: 'u-emp1', oldRate: 80, newRate: 85, reason: 'Annual review', changedByKey: 'u-hr', createdAt: ts('2026-09-28T10:18:00Z') },
  { userKey: 'u-emp1', oldRate: null, newRate: 80, reason: 'Initial hire', changedByKey: 'u-hr', createdAt: ts('2026-09-15T09:00:00Z') },
  { userKey: 'u-emp2', oldRate: 90, newRate: 95, reason: 'Renegotiation', changedByKey: 'u-hr', createdAt: ts('2026-09-20T09:00:00Z') },
  { userKey: 'u-emp2', oldRate: null, newRate: 95, reason: 'Contract start', changedByKey: 'u-hr', createdAt: ts('2026-09-10T09:00:00Z') },
]

const DOCUMENTS = [
  { userKey: 'u-emp1', kind: 'id_proof', name: 'Driver License', size: 2048576, mimeType: 'image/jpeg', storageKey: 'docs/dl-esha.jpg', status: 'verified', expiresAt: '2027-05-15' },
  { userKey: 'u-emp1', kind: 'tax_form', name: 'W-4 Form', size: 102400, mimeType: 'application/pdf', storageKey: 'docs/w4-esha.pdf', status: 'verified' },
  { userKey: 'u-emp2', kind: 'contract', name: 'Contract v2', size: 512000, mimeType: 'application/pdf', storageKey: 'docs/contract-devv2.pdf', status: 'expired', expiresAt: '2026-10-15' },
]

const ONBOARDING_CANDIDATES = [
  { name: 'Arjun Patel', email: 'arjun@eniac.demo', employeeId: 'E000103', department: 'Engineering', stage: 'invited', invitedAt: ts('2026-09-28T10:00:00Z'), documentsUploaded: 0, documentsTotal: 3 },
  { name: 'Priya Sharma', email: 'priya@eniac.demo', employeeId: 'E000104', department: 'Design', stage: 'docs_pending', invitedAt: ts('2026-09-25T10:00:00Z'), documentsUploaded: 1, documentsTotal: 3 },
  { name: 'Marcus Chen', email: 'marcus@eniac.demo', employeeId: 'E000105', department: 'Engineering', stage: 'payrate_pending', invitedAt: ts('2026-09-20T10:00:00Z'), documentsUploaded: 3, documentsTotal: 3 },
]

const ATTENDANCE = [
  { userKey: 'u-hr', status: 'present', markedAt: '2026-09-30T08:02:00.000Z', source: 'self' },
  { userKey: 'u-emp1', status: 'present', markedAt: '2026-09-30T08:10:00.000Z', source: 'self', location: 'Hybrid — BLR' },
  { userKey: 'u-emp2', status: 'remote', markedAt: '2026-09-30T08:20:00.000Z', source: 'self' },
  { userKey: 'u-manager', status: 'late', markedAt: '2026-09-30T09:35:00.000Z', source: 'self' },
]

const NOTIFICATIONS = [
  { userKey: 'u-hr', type: 'attendance', title: '2 people unmarked', message: 'Dev Contractor and 1 more have not marked attendance today.', read: false, relatedKey: 'u-emp2', createdAt: NOW },
  { userKey: 'u-hr', type: 'onboarding', title: 'Docs pending', message: 'Riya Sharma uploaded her ID proof — verification pending.', read: false, relatedId: 'ob-3', createdAt: NOW },
  { userKey: 'u-hr', type: 'payrate', title: 'Rate change approved', message: 'Esha Employee: $80 → $85/hr effective Apr 1.', read: true, relatedKey: 'u-emp1', createdAt: NOW },
]

const ACTIVITIES = [
  { description: 'Created client Initech LLC (CL-2026-003)', actorKey: 'u-manager', entityType: 'client', createdAt: NOW },
  { description: 'Assigned Dev Contractor to Acme Portal Revamp @ 50% FTE', actorKey: 'u-manager', entityType: 'assignment', createdAt: NOW },
  { description: 'Updated pay rate for Esha Employee: $80 → $85/hr', actorKey: 'u-hr', entityType: 'payrate', createdAt: NOW },
  { description: 'Attendance freeze ran for 2026-09-29 — 6 present, 1 absent', actorKey: 'u-admin', entityType: 'attendance', createdAt: NOW },
]

const DEPARTMENTS = ['Engineering', 'People Ops', 'Delivery', 'Design', 'Platform']

/** Stable marker so `--reset` can find (and only remove) demo rows. */
const DEMO_TAG = 'seed:demo'

/**
 * Database that holds real people. The demo fixtures all share one
 * well-known password, so seeding them here would hand anyone who knows it an
 * account on live data — and on top of that the platform's own users would be
 * sitting in the same collection. Refuse by default rather than trust the
 * operator to remember which cluster they are pointed at.
 */
const SHARED_PLATFORM_DB = process.env.PLATFORM_DB_NAME ?? 'alphanet'

function assertNotSharedDatabase(dbName: string): void {
  if (dbName !== SHARED_PLATFORM_DB) return
  if (process.env.SEED_ALLOW_SHARED_DB === 'true') {
    console.warn(
      `\n  WARNING: seeding demo accounts into the SHARED database "${dbName}".\n` +
        `  Every fixture account will use the password "${DEMO_PASSWORD}".\n`,
    )
    return
  }
  throw new Error(
    `Refusing to seed demo accounts into the shared platform database "${dbName}".\n` +
      `  These fixtures all share the password "${DEMO_PASSWORD}", so this would expose\n` +
      `  real employee data behind publicly known credentials.\n\n` +
      `  Seed a scratch database instead, for example:\n` +
      `    MONGODB_DB_NAME=eniac_ems_seed npm run seed:demo\n\n` +
      `  Set SEED_ALLOW_SHARED_DB=true only if you truly intend this.`,
  )
}

async function seedDemo(reset: boolean): Promise<void> {
  const db = await getDb()
  assertNotSharedDatabase(db.databaseName)
  await ensureIndexes()
  await seedLeaveTypes()

  if (reset) {
    // Wipe by seed tag, not by natural key. Deleting only the "parent" rows
    // (users/clients/projects) would strand their children, and the next run's
    // upserts match on freshly minted _ids, so every dependent collection would
    // silently double up. Tag-scoped deletion is order-independent and can
    // never touch a row this script did not create.
    // `leave_types` and `settings` are deliberately untagged: they are org-wide
    // config, not demo fixtures, and `seedLeaveTypes()` owns them.
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
    )
    const targets = [...new Set(Object.values(COLLECTIONS))].filter((name) =>
      existing.has(name),
    )
    const results = await Promise.all(
      targets.map((name) => db.collection(name).deleteMany({ seedTag: DEMO_TAG })),
    )
    const removed = results.reduce((sum, r) => sum + r.deletedCount, 0)
    logger.info({ tag: DEMO_TAG, removed }, 'reset: removed existing demo rows')
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD)

  // ── users ────────────────────────────────────────────────────────────────
  const userIds = new Map<string, ObjectId>()
  for (const spec of USERS) {
    const doc: Record<string, unknown> = {
      name: spec.name,
      email: spec.email.toLowerCase(),
      passwordHash,
      employeeId: spec.employeeId,
      department: spec.department,
      role: spec.role,
      // EMS-owned override; see lib/role.ts (D-19). Resolution prefers this.
      emsRole: spec.role,
      // The platform only knows admin|user, so an EMS admin stays an admin
      // there and every other EMS role degrades to a platform `user`.
      platformRole: spec.role === 'admin' ? 'admin' : 'user',
      status: 'active',
      billable: spec.billable,
      currency: 'USD',
      employmentType: spec.employmentType ?? 'full_time',
      title: spec.title ?? null,
      payRate: spec.payRate ?? null,
      managerId: spec.role === 'employee' ? null : null,
      joinedAt: ts('2026-01-05T09:00:00.000Z'),
      createdAt: ts('2026-01-05T09:00:00.000Z'),
      updatedAt: NOW,
      seedTag: DEMO_TAG,
    }
    await db.collection(COLLECTIONS.USERS).updateOne(
      { email: spec.email.toLowerCase() },
      { $set: doc },
      { upsert: true },
    )
    const saved = await db.collection(COLLECTIONS.USERS).findOne({ email: spec.email.toLowerCase() })
    userIds.set(spec.key, saved!._id as ObjectId)
  }

  // Reporting lines, now that every id is known.
  await Promise.all([
    db.collection(COLLECTIONS.USERS).updateOne({ email: 'esha@eniac.demo' }, { $set: { managerId: userIds.get('u-manager') } }),
    db.collection(COLLECTIONS.USERS).updateOne({ email: 'dev@eniac.demo' }, { $set: { managerId: userIds.get('u-manager') } }),
  ])

  // ── clients ──────────────────────────────────────────────────────────────
  const clientIds = new Map<string, ObjectId>()
  for (const spec of CLIENTS) {
    const doc: Record<string, unknown> = {
      clientCode: spec.code,
      name: spec.name,
      normalizedName: spec.normalizedName,
      description: spec.description ?? '',
      status: 'active',
      paymentTerms: spec.paymentTerms ?? null,
      contactEmail: spec.contactEmail ?? null,
      contractValue: spec.contractValue ?? null,
      createdAt: ts('2026-02-01T09:00:00.000Z'),
      updatedAt: NOW,
      seedTag: DEMO_TAG,
    }
    await db.collection(COLLECTIONS.CLIENTS).updateOne(
      { normalizedName: spec.normalizedName },
      { $set: doc },
      { upsert: true },
    )
    const saved = await db.collection(COLLECTIONS.CLIENTS).findOne({ normalizedName: spec.normalizedName })
    clientIds.set(spec.code, saved!._id as ObjectId)
  }

  // ── client contacts + activity ───────────────────────────────────────────
  for (const spec of CLIENTS) {
    const clientId = clientIds.get(spec.code)!
    for (const contact of CLIENT_CONTACTS[spec.code] ?? []) {
      await db.collection(COLLECTIONS.CLIENT_CONTACTS).updateOne(
        { clientId, email: contact.email },
        { $set: { name: contact.name, phone: contact.phone, updatedAt: NOW }, $setOnInsert: { createdAt: NOW, seedTag: DEMO_TAG } },
        { upsert: true },
      )
    }
  }
  for (const spec of CLIENT_ACTIVITY) {
    const clientId = clientIds.get(spec.clientCode)!
    await db.collection(COLLECTIONS.CLIENT_ACTIVITY).updateOne(
      { clientId, description: spec.description },
      {
        $set: {
          actor: spec.actorKey === 'u-admin' ? 'System' : 'Meera Manager',
          actorId: userIds.get(spec.actorKey) ?? null,
          kind: spec.entityType,
          entityType: spec.entityType,
          timestamp: spec.createdAt,
          createdAt: spec.createdAt,
          seedTag: DEMO_TAG,
        },
      },
      { upsert: true },
    )
  }

  // ── projects ─────────────────────────────────────────────────────────────
  const projectIds = new Map<string, ObjectId>()
  for (const spec of PROJECTS) {
    const clientId = clientIds.get(spec.clientCode)!
    const clientName = CLIENTS.find((c) => c.code === spec.clientCode)!.name
    const teamMemberIds = spec.teamKeys.map((k) => userIds.get(k)!)
    const doc: Record<string, unknown> = {
      name: spec.name,
      sowNumber: spec.sowNumber,
      // Legacy platform fields, mirrored exactly as the Phase 6 service does.
      client: clientName,
      clientId,
      description: spec.description,
      startDate: spec.startDate,
      endDate: spec.endDate,
      deadline: spec.deadline,
      status: spec.status,
      hourlyRate: spec.hourlyRate,
      seats: spec.seats,
      managerId: userIds.get(spec.managerKey) ?? null,
      teamMemberIds,
      createdAt: ts('2026-06-20T09:00:00.000Z'),
      updatedAt: NOW,
      seedTag: DEMO_TAG,
    }
    await db.collection(COLLECTIONS.PROJECTS).updateOne(
      { sowNumber: spec.sowNumber },
      { $set: doc },
      { upsert: true },
    )
    const saved = await db.collection(COLLECTIONS.PROJECTS).findOne({ sowNumber: spec.sowNumber })
    projectIds.set(spec.sowNumber, saved!._id as ObjectId)
  }

  // ── assignments ──────────────────────────────────────────────────────────
  for (const spec of ASSIGNMENTS) {
    const projectId = projectIds.get(spec.sowNumber)!
    const project = PROJECTS.find((p) => p.sowNumber === spec.sowNumber)!
    const clientId = clientIds.get(project.clientCode)!
    const userId = userIds.get(spec.userKey)!
    const doc: Record<string, unknown> = {
      resourceId: userId,
      userId,
      projectId,
      clientId,
      startDate: spec.startDate,
      endDate: spec.endDate,
      billRate: spec.billRate,
      payRate: spec.payRate,
      currency: 'USD',
      ftePercent: spec.ftePercent,
      roleOnProject: spec.roleOnProject,
      billingType: 'hourly',
      timesheetRequired: true,
      approvalRequired: true,
      timesheetEnabled: true,
      status: spec.status,
      poSow: spec.sowNumber,
      createdAt: ts(`${spec.startDate}T09:00:00.000Z`),
      updatedAt: NOW,
      seedTag: DEMO_TAG,
    }
    await db.collection(COLLECTIONS.ASSIGNMENTS).updateOne(
      { userId, projectId },
      { $set: doc },
      { upsert: true },
    )
  }

  // ── timesheets ───────────────────────────────────────────────────────────
  for (const spec of TIMESHEETS) {
    const projectId = projectIds.get(spec.sowNumber)!
    const userId = userIds.get(spec.userKey)!
    await db.collection(COLLECTIONS.TIMESHEETS).updateOne(
      { userId, projectId, weekStart: spec.weekStart },
      {
        $set: {
          regularHours: spec.regularHours,
          overtimeHours: spec.overtimeHours,
          totalHours: spec.regularHours + spec.overtimeHours,
          status: spec.status,
          notes: '',
          createdAt: ts(`${spec.weekStart}T09:00:00.000Z`),
          updatedAt: NOW,
          seedTag: DEMO_TAG,
        },
        $setOnInsert: { entries: [] },
      },
      { upsert: true },
    )
  }

  // ── HR: leave, payrate history, documents, onboarding, attendance ─────────
  for (const spec of LEAVE_REQUESTS) {
    const userId = userIds.get(spec.userKey)!
    const doc: Record<string, unknown> = {
      userId,
      type: spec.type,
      startDate: spec.startDate,
      endDate: spec.endDate,
      days: spec.days,
      status: spec.status,
      reason: spec.reason ?? '',
      note: spec.note ?? '',
      submittedAt: spec.submittedAt,
      reviewedBy: spec.reviewerKey ? userIds.get(spec.reviewerKey) : null,
      reviewedAt: spec.reviewedAt ?? null,
      createdAt: spec.submittedAt,
      updatedAt: NOW,
      seedTag: DEMO_TAG,
    }
    await db
      .collection(COLLECTIONS.LEAVE_REQUESTS)
      .updateOne({ userId, startDate: spec.startDate, type: spec.type }, { $set: doc }, { upsert: true })
  }

  for (const spec of PAYRATE_HISTORY) {
    const userId = userIds.get(spec.userKey)!
    await db.collection(COLLECTIONS.PAYRATE_HISTORY).updateOne(
      { userId, createdAt: new Date(spec.createdAt) },
      {
        $set: {
          oldRate: spec.oldRate,
          newRate: spec.newRate,
          currency: 'USD',
          reason: spec.reason,
          changedBy: userIds.get(spec.changedByKey),
          seedTag: DEMO_TAG,
        },
      },
      { upsert: true },
    )
  }

  for (const spec of DOCUMENTS) {
    const userId = userIds.get(spec.userKey)!
    const user = USERS.find((u) => u.key === spec.userKey)!
    await db.collection(COLLECTIONS.DOCUMENTS).updateOne(
      { userId, storageKey: spec.storageKey },
      {
        $set: {
          name: spec.name,
          kind: spec.kind,
          size: spec.size,
          mimeType: spec.mimeType,
          status: spec.status,
          expiresAt: spec.expiresAt ?? null,
          projectId: null,
          uploadedBy: userId,
          uploadedByName: user.name,
          createdAt: ts('2026-09-20T10:00:00.000Z'),
          updatedAt: NOW,
          seedTag: DEMO_TAG,
        },
      },
      { upsert: true },
    )
  }

  for (const spec of ONBOARDING_CANDIDATES) {
    await db.collection(COLLECTIONS.ONBOARDING_CANDIDATES).updateOne(
      { email: spec.email.toLowerCase() },
      {
        $set: {
          name: spec.name,
          employeeId: spec.employeeId,
          department: spec.department,
          stage: spec.stage,
          invitedAt: spec.invitedAt,
          documentsUploaded: spec.documentsUploaded,
          documentsTotal: spec.documentsTotal,
          updatedAt: NOW,
          seedTag: DEMO_TAG,
        },
      },
      { upsert: true },
    )
  }

  for (const spec of ATTENDANCE) {
    const userId = userIds.get(spec.userKey)!
    await db.collection(COLLECTIONS.ATTENDANCE).updateOne(
      { userId, date: MOCK_TODAY },
      {
        $set: {
          status: spec.status,
          markedAt: new Date(spec.markedAt),
          source: spec.source,
          location: spec.location ?? null,
          updatedAt: NOW,
          seedTag: DEMO_TAG,
        },
        $setOnInsert: { createdAt: new Date(spec.markedAt) },
      },
      { upsert: true },
    )
  }

  // ── notifications + audit feed ───────────────────────────────────────────
  for (const spec of NOTIFICATIONS) {
    const relatedId = spec.relatedKey ? userIds.get(spec.relatedKey) : null
    await db.collection(COLLECTIONS.NOTIFICATIONS).updateOne(
      { userId: userIds.get(spec.userKey), title: spec.title, message: spec.message },
      {
        $set: {
          type: spec.type,
          body: spec.message,
          read: spec.read,
          relatedId,
          link: null,
          createdAt: spec.createdAt,
          seedTag: DEMO_TAG,
        },
      },
      { upsert: true },
    )
  }

  for (const spec of ACTIVITIES) {
    await db.collection(COLLECTIONS.ACTIVITIES).updateOne(
      { description: spec.description },
      {
        $set: {
          userId: userIds.get(spec.actorKey) ?? null,
          description: spec.description,
          entityType: spec.entityType,
          entityId: null,
          createdAt: spec.createdAt,
          seedTag: DEMO_TAG,
        },
      },
      { upsert: true },
    )
  }

  // ── departments + org settings ───────────────────────────────────────────
  for (const name of DEPARTMENTS) {
    await db
      .collection(COLLECTIONS.DEPARTMENTS)
      .updateOne({ name }, { $set: { name, seedTag: DEMO_TAG }, $setOnInsert: { createdAt: NOW } }, { upsert: true })
  }
  await db.collection(COLLECTIONS.SETTINGS).updateOne(
    { orgKey: 'global' },
    {
      $set: {
        orgName: 'Eniac Inc.',
        showBillRateToEmployee: false,
        leavePolicy: { annualLeaveDays: 20, sickLeaveDays: 10, lockAfterApproval: true },
        approvalChain: ['manager', 'hr', 'admin'],
        updatedAt: NOW,
      },
      $setOnInsert: { createdAt: NOW },
    },
    { upsert: true },
  )

  const counts = {
    users: USERS.length,
    clients: CLIENTS.length,
    projects: PROJECTS.length,
    assignments: ASSIGNMENTS.length,
    timesheets: TIMESHEETS.length,
    leaveRequests: LEAVE_REQUESTS.length,
    documents: DOCUMENTS.length,
    notifications: NOTIFICATIONS.length,
    departments: DEPARTMENTS.length,
  }

  logger.info({ tag: DEMO_TAG, ...counts }, 'demo seed complete')
  console.log('seed:demo complete —', JSON.stringify(counts, null, 2))
  console.log(`Sign in with any fixture email and the password "${DEMO_PASSWORD}"`)
  console.log('  admin@eniac.demo | hr@eniac.demo | manager@eniac.demo | esha@eniac.demo')
  console.log('  esha@eniac.demo  | dev@eniac.demo')
}

const reset = process.argv.includes('--reset')
seedDemo(reset)
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('seed:demo failed —', err)
    await closeDb().catch(() => {})
    process.exit(1)
  })