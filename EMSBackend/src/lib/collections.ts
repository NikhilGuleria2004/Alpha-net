import { getDb } from './mongodb.js'
import { logger } from './logger.js'

export const COLLECTIONS = {
  // ── Shared with the timesheet platform backend (additive extensions only) ──
  USERS: 'users',
  PROJECTS: 'projects',
  TIMESHEETS: 'timesheets',
  DAILY_TIMESHEETS: 'daily_timesheets',
  NOTIFICATIONS: 'notifications',
  ACTIVITIES: 'activities',
  DOCUMENTS: 'documents',
  SESSIONS: 'sessions',
  SETTINGS: 'settings',
  INVITES: 'invites',
  INVOICES: 'invoices',
  INVOICE_COUNTERS: 'invoice_counters',
  PASSWORD_RESETS: 'password_resets',
  LOGIN_OTPS: 'login_otps',
  CLIENTS: 'clients',
  ASSIGNMENTS: 'assignments',
  PAYROLLS: 'payrolls',
  // ── EMS-new collections (Phase 0-2) ─────────────────────────────────────────
  ATTENDANCE: 'attendance',
  LEAVE_REQUESTS: 'leave_requests',
  LEAVE_TYPES: 'leave_types',
  ONBOARDING_CANDIDATES: 'onboarding_candidates',
  PAYRATE_HISTORY: 'payrate_history',
  DEPARTMENTS: 'departments',
  CLIENT_CONTACTS: 'client_contacts',
  CLIENT_ACTIVITY: 'client_activity',
  // ── EMS-new collections (Phase 7) ───────────────────────────────────────────
  IDEMPOTENCY_KEYS: 'idempotency_keys',
  DASHBOARD_SNAPSHOTS: 'dashboard_snapshots',
} as const

// Legacy-retention rule: every pre-EMS field stays supported read-AND-write
// for >= 2 releases. All indexes below are additive — none modify or drop
// an existing index from the timesheet platform backend.
let indexesEnsured = false

/**
 * Create a unique index that only applies to documents actually carrying a
 * string value for `field`, migrating a pre-existing non-partial index if needed.
 *
 * Every collection here is SHARED with the timesheet platform, and this is the
 * single most dangerous thing you can do to a shared collection: a plain unique
 * index treats a missing field as `null`, so legacy platform rows collide with
 * each other (the index cannot even be built — E11000) and with any later row
 * that also omits the field. Scoping the index to rows that really hold the
 * value keeps uniqueness where it matters and leaves foreign rows alone.
 */
async function ensurePartialUnique(
  collection: any,
  field: string,
  indexName: string,
): Promise<void> {
  const existing = (await collection.indexes()).find((index: any) => index.name === indexName)
  if (existing && !existing.partialFilterExpression) {
    // createIndex raises IndexOptionsConflict when the name exists with
    // different options, so the pre-partial index has to be dropped first.
    await collection.dropIndex(indexName)
    logger.info({ collection: collection.collectionName, indexName }, 'dropped non-partial index (superseded by partial equivalent)')
  }
  await collection.createIndex(
    { [field]: 1 },
    { unique: true, partialFilterExpression: { [field]: { $type: 'string' } } },
  )
}

export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) {
    logger.debug('indexes already ensured, skipping')
    return
  }

  const db = await getDb()

  // ── users (shared, extended) ──────────────────────────────────────────────
  const users = db.collection(COLLECTIONS.USERS)
  await users.createIndex({ email: 1 }, { unique: true })
  await users.createIndex({ employeeId: 1 }, { unique: true })
  await users.createIndex({ supervisorId: 1 })
  await users.createIndex({ status: 1 })
  await users.createIndex({ isSupervisor: 1 })
  // EMS extension: 5-role authorization matrix (§6.1).
  await users.createIndex({ role: 1 })

  // ── projects (shared, extended) ───────────────────────────────────────────
  const projects = db.collection(COLLECTIONS.PROJECTS)
  await projects.createIndex({ sowNumber: 1 }, { unique: true })
  await projects.createIndex({ status: 1 })
  await projects.createIndex({ managerId: 1 })
  await projects.createIndex({ supervisorId: 1 })
  await projects.createIndex({ teamMemberIds: 1 })
  await projects.createIndex({ startDate: 1 })
  await projects.createIndex({ endDate: 1 })
  await projects.createIndex({ deadline: 1 })
  await projects.createIndex({ clientId: 1 })

  // ── timesheets (shared, read-only from EMS) ───────────────────────────────
  const timesheets = db.collection(COLLECTIONS.TIMESHEETS)
  await timesheets.createIndex({ userId: 1 })
  await timesheets.createIndex({ projectId: 1 })
  await timesheets.createIndex({ weekStart: 1 })
  await timesheets.createIndex({ status: 1 })
  await timesheets.createIndex({ assignmentId: 1 })
  await timesheets.createIndex({ userId: 1, projectId: 1, weekStart: 1 }, { unique: true })

  // ── daily_timesheets (shared, read-only from EMS) ──────────────────────────
  const dailyTimesheets = db.collection(COLLECTIONS.DAILY_TIMESHEETS)
  await dailyTimesheets.createIndex({ userId: 1, projectId: 1, date: 1, entryType: 1 }, { unique: true })
  await dailyTimesheets.createIndex({ weeklyTimesheetId: 1 })
  await dailyTimesheets.createIndex({ userId: 1, date: 1 })
  await dailyTimesheets.createIndex({ assignmentId: 1 })

  // ── notifications (shared, reused) ──────────────────────────────────────────
  const notifications = db.collection(COLLECTIONS.NOTIFICATIONS)
  await notifications.createIndex({ userId: 1, read: 1, createdAt: -1 })

  // ── activities (shared, reused) ──────────────────────────────────────────
  const activities = db.collection(COLLECTIONS.ACTIVITIES)
  await activities.createIndex({ createdAt: -1 })
  await activities.createIndex({ entityType: 1, entityId: 1 })

  // ── documents (shared, extended) ──────────────────────────────────────────
  const documents = db.collection(COLLECTIONS.DOCUMENTS)
  await documents.createIndex({ projectId: 1 })
  await documents.createIndex({ uploadedBy: 1 })
  await documents.createIndex({ createdAt: -1 })
  // EMS extension: userId-scoped listing (GET /documents?userId=).
  await documents.createIndex({ userId: 1 })
  await documents.createIndex({ kind: 1 })

  // ── sessions (shared, extended) ────────────────────────────────────────────
  const sessions = db.collection(COLLECTIONS.SESSIONS)
  await sessions.createIndex({ userId: 1 })
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  // EMS extension: opaque refresh token hash (sha256) — unique for rotation safety.
  // Partial because the platform's session documents omit `refreshHash`, so a
  // plain unique index would fail its second login with E11000 (D-12).
  await ensurePartialUnique(sessions, 'refreshHash', 'refreshHash_1')

  // ── settings (shared, extended) ────────────────────────────────────────────
  const settings = db.collection(COLLECTIONS.SETTINGS)
  await settings.createIndex({ orgKey: 1 }, { unique: true })
  await settings.createIndex({ userId: 1 })

  // ── invoices (shared, read-only from EMS) ──────────────────────────────────
  const invoices = db.collection(COLLECTIONS.INVOICES)
  await invoices.createIndex({ invoiceNumber: 1 }, { unique: true })
  await invoices.createIndex({ projectId: 1 })
  await invoices.createIndex({ status: 1 })
  await invoices.createIndex({ weekStart: 1 })
  await invoices.createIndex({ projectId: 1, weekStart: 1 })
  await invoices.createIndex({ billedTimesheetIds: 1 })
  await invoices.createIndex({ assignmentId: 1 })

  const invoiceCounters = db.collection(COLLECTIONS.INVOICE_COUNTERS)
  await invoiceCounters.createIndex({ key: 1 }, { unique: true })

  // ── clients (shared, extended) ───────────────────────────────────────────
  const clients = db.collection(COLLECTIONS.CLIENTS)
  await clients.createIndex({ normalizedName: 1 }, { unique: true })
  await clients.createIndex({ status: 1 })
  // EMS extension: the `CL-YYYY-NNN` human handle. Replaces the Phase 0
  // `clientId` index — §5.3 originally specified a `C####` code, but the
  // EMSFrontend contract is `clientCode` in `CL-2026-###` format (rule 3), and
  // no row ever wrote `clientId`. Leaving the old unique index in place would
  // also break inserts: MongoDB allows only one document missing the indexed
  // field, so the second client would fail with E11000. The platform backend
  // never created this index (it owns only `normalizedName`), so dropping it
  // does not touch a platform-created index.
  const staleClientIdIndex = (await clients.indexes()).find((index) => index.name === 'clientId_1')
  if (staleClientIdIndex) {
    await clients.dropIndex('clientId_1')
    logger.info('dropped stale clients.clientId_1 index (superseded by clientCode)')
  }
  // `clientCode` must be partial for the same reason (D-12), and on the shared
  // Atlas `alphanet` database it is not optional: every pre-existing platform
  // client row predates this field, so they all carry `clientCode: null`. A
  // plain unique index cannot even be *built* over them (E11000 at build time),
  // which aborted the rest of ensureIndexes and left the deployment half-migrated.
  await ensurePartialUnique(clients, 'clientCode', 'clientCode_1')

  // ── assignments (shared, extended) ────────────────────────────────────────
  const assignments = db.collection(COLLECTIONS.ASSIGNMENTS)
  await assignments.createIndex({ resourceId: 1 })
  await assignments.createIndex({ projectId: 1 })
  await assignments.createIndex({ clientId: 1 })
  await assignments.createIndex({ status: 1 })
  await assignments.createIndex({ resourceId: 1, projectId: 1, status: 1 })
  // EMS extension: userId-based compound index for the new API surface.
  await assignments.createIndex({ userId: 1, projectId: 1, status: 1 })
  await assignments.createIndex({ userId: 1 })

  // ── payrolls (shared, reused) ────────────────────────────────────────────
  const payrolls = db.collection(COLLECTIONS.PAYROLLS)
  await payrolls.createIndex({ resourceId: 1 })
  await payrolls.createIndex({ assignmentId: 1 })
  await payrolls.createIndex({ timesheetId: 1 }, { unique: true })
  await payrolls.createIndex({ status: 1 })

  // ── invites (shared, extended) ───────────────────────────────────────────
  const invites = db.collection(COLLECTIONS.INVITES)
  await invites.createIndex({ token: 1 }, { unique: true })
  await invites.createIndex({ email: 1 })
  await invites.createIndex({ expiresAt: 1 })
  // EMS extension: hash-based token + extended invite fields. Partial for the
  // same reason: the platform's existing invites predate `tokenHash`, so all of
  // them collide as `null` under a plain unique index (D-16).
  await ensurePartialUnique(invites, 'tokenHash', 'tokenHash_1')

  // ── password_resets (shared, reused) ──────────────────────────────────────
  const resets = db.collection(COLLECTIONS.PASSWORD_RESETS)
  await resets.createIndex({ tokenHash: 1 }, { unique: true })
  await resets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  // ── login_otps (shared, reused) ──────────────────────────────────────────
  const loginOtps = db.collection(COLLECTIONS.LOGIN_OTPS)
  await loginOtps.createIndex({ email: 1 })
  await loginOtps.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  // ── EMS NEW collections (Phase 0 scaffolding) ─────────────────────────────

  // attendance: one mark per user per day. Unique (userId, date) prevents
  // double rows under race.
  const attendance = db.collection(COLLECTIONS.ATTENDANCE)
  await attendance.createIndex({ userId: 1, date: 1 }, { unique: true })
  await attendance.createIndex({ date: 1 })
  await attendance.createIndex({ status: 1, date: 1 })

  // leave_requests
  const leaveRequests = db.collection(COLLECTIONS.LEAVE_REQUESTS)
  await leaveRequests.createIndex({ userId: 1, status: 1 })
  await leaveRequests.createIndex({ status: 1 })

  // leave_types (seeded enum-like)
  const leaveTypes = db.collection(COLLECTIONS.LEAVE_TYPES)
  await leaveTypes.createIndex({ value: 1 }, { unique: true })

  // onboarding_candidates
  const onboarding = db.collection(COLLECTIONS.ONBOARDING_CANDIDATES)
  await onboarding.createIndex({ stage: 1 })
  await onboarding.createIndex({ email: 1 })

  // payrate_history
  const payrateHistory = db.collection(COLLECTIONS.PAYRATE_HISTORY)
  await payrateHistory.createIndex({ userId: 1, createdAt: -1 })

  // departments (seeded enum-like)
  const departments = db.collection(COLLECTIONS.DEPARTMENTS)
  await departments.createIndex({ name: 1 }, { unique: true })

  // client_contacts
  const clientContacts = db.collection(COLLECTIONS.CLIENT_CONTACTS)
  await clientContacts.createIndex({ clientId: 1 })

  // client_activity
  const clientActivity = db.collection(COLLECTIONS.CLIENT_ACTIVITY)
  await clientActivity.createIndex({ clientId: 1, timestamp: -1 })

  // idempotency_keys (24h TTL replay protection on POST creates)
  const idempotencyKeys = db.collection(COLLECTIONS.IDEMPOTENCY_KEYS)
  await idempotencyKeys.createIndex({ key: 1 }, { unique: true })
  await idempotencyKeys.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  // dashboard_snapshots (5-min app-TTL cache per role+scope)
  const dashboardSnapshots = db.collection(COLLECTIONS.DASHBOARD_SNAPSHOTS)
  await dashboardSnapshots.createIndex({ key: 1, expiresAt: 1 })

  indexesEnsured = true
  logger.info({ collections: Object.values(COLLECTIONS) }, 'ensured indexes')
}
