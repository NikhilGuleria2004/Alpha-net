import { getDb } from './mongodb.js'
import { logger } from './logger.js'

export const COLLECTIONS = {
  USERS: 'users',
  PROJECTS: 'projects',
  TIMESHEETS: 'timesheets',
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
  // Flow Integration Phase 0 scaffolding (see /flowIntegration.md): new
  // collection names for the Eniac staffing flow. Declared here so later
  // phases can reference them, but ensureIndexes() below does NOT create
  // their indexes yet — see ensureFlowIntegrationIndexes(), which is
  // intentionally never called until Phase 1+ backfills are ready.
  CLIENTS: 'clients',
  ASSIGNMENTS: 'assignments',
  PAYROLLS: 'payrolls',
} as const

// ── Flow Integration Phase 9 (CUTOVER) — LEGACY RETENTION POLICY ────────────
// The staffing-flow collections above are ADDITIVE: every pre-flow field
// remains a supported read-AND-write surface for at least TWO RELEASES after
// cutover, and no deprecation notice may be drafted inside that window
// (flowIntegration.md §Phase 9 — "Keep legacy fields ≥2 releases"). The
// frozen contracts:
//   * projects.teamMemberIds     — dual-written by assignment create/activate
//   * projects.client/sowNumber/hourlyRate — legacy strings/numbers kept
//   * invoices on the legacy path — stored WITHOUT lineage keys; the API
//     always exposes lines/billedTimesheetIds/approvedOnly (stable shape)
//   * timesheets without assignmentId — remain valid rows; Phase 4 writes the
//     key only when resolved and the Phase 9 'full' gate applies to NEW
//     creates only, never to existing documents
//   * documents without kind/userId — legacy uploads keep working (Phase 8)
// Enforced by tests: flow-baseline.test.ts (frozen shapes) +
// flow-phase9.test.ts §9.3 (legacy-field retention).

// Tracks whether indexes have been ensured to prevent redundant calls on cold start
let indexesEnsured = false

export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) {
    logger.debug('indexes already ensured, skipping')
    return
  }

  const db = await getDb()

  const users = db.collection(COLLECTIONS.USERS)
  await users.createIndex({ email: 1 }, { unique: true })
  await users.createIndex({ employeeId: 1 }, { unique: true })
  await users.createIndex({ supervisorId: 1 })
  await users.createIndex({ status: 1 })
  await users.createIndex({ isSupervisor: 1 })

  const projects = db.collection(COLLECTIONS.PROJECTS)
  await projects.createIndex({ sowNumber: 1 }, { unique: true })
  await projects.createIndex({ status: 1 })
  await projects.createIndex({ managerId: 1 })
  await projects.createIndex({ supervisorId: 1 })
  await projects.createIndex({ teamMemberIds: 1 })
  await projects.createIndex({ startDate: 1 })
  await projects.createIndex({ endDate: 1 })
  await projects.createIndex({ deadline: 1 })

  const timesheets = db.collection(COLLECTIONS.TIMESHEETS)
  await timesheets.createIndex({ userId: 1 })
  await timesheets.createIndex({ projectId: 1 })
  await timesheets.createIndex({ weekStart: 1 })
  await timesheets.createIndex({ status: 1 })
  // Flow Integration Phase 4: non-unique lineage index for the new optional
  // `assignmentId` link. Additive only — the legacy unique guard on
  // (userId, projectId, weekStart) below stays exactly as it was, so a
  // timesheet is still unique per resource/project/week.
  await timesheets.createIndex({ assignmentId: 1 })
  await timesheets.createIndex({ userId: 1, projectId: 1, weekStart: 1 }, { unique: true })

  const notifications = db.collection(COLLECTIONS.NOTIFICATIONS)
  await notifications.createIndex({ userId: 1 })
  await notifications.createIndex({ read: 1 })
  await notifications.createIndex({ createdAt: -1 })

  const activities = db.collection(COLLECTIONS.ACTIVITIES)
  await activities.createIndex({ userId: 1 })
  await activities.createIndex({ projectId: 1 })
  await activities.createIndex({ timesheetId: 1 })
  await activities.createIndex({ createdAt: -1 })

  const documents = db.collection(COLLECTIONS.DOCUMENTS)
  await documents.createIndex({ projectId: 1 })
  await documents.createIndex({ uploadedBy: 1 })
  await documents.createIndex({ createdAt: -1 })
  // Flow Integration Phase 8 (§5, item 1): onboarding checklist listing
  // (GET /documents?userId=). Additive, non-unique — legacy documents simply
  // have no key here, so nothing else changes.
  await documents.createIndex({ userId: 1 })

  const sessions = db.collection(COLLECTIONS.SESSIONS)
  await sessions.createIndex({ userId: 1 })
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  const settings = db.collection(COLLECTIONS.SETTINGS)
  await settings.createIndex({ orgKey: 1 }, { unique: true })
  await settings.createIndex({ userId: 1 })

  const invoices = db.collection(COLLECTIONS.INVOICES)
  await invoices.createIndex({ invoiceNumber: 1 }, { unique: true })
  await invoices.createIndex({ projectId: 1 })
  await invoices.createIndex({ status: 1 })
  await invoices.createIndex({ weekStart: 1 })
  await invoices.createIndex({ projectId: 1, weekStart: 1 })
  // Flow Integration Phase 5: invoice→timesheet lineage. Non-unique only —
  // `billedTimesheetIds` is read as the union of non-void invoices (the
  // double-bill reservation), `assignmentId` is the optional billing scope.
  // Neither touches the unique `invoiceNumber` guard above.
  await invoices.createIndex({ billedTimesheetIds: 1 })
  await invoices.createIndex({ assignmentId: 1 })

  const invoiceCounters = db.collection(COLLECTIONS.INVOICE_COUNTERS)
  await invoiceCounters.createIndex({ key: 1 }, { unique: true })

  // Flow Integration Phase 1: normalized client names (Sony/sony dedupe).
  // Additive: no existing index touched. Projects gain an optional clientId
  // FK in this phase, so both new indexes are safe for legacy docs (sparse
  // usage — docs without clientId simply have no entry).
  const clients = db.collection(COLLECTIONS.CLIENTS)
  await clients.createIndex({ normalizedName: 1 }, { unique: true })
  const projectsForClients = db.collection(COLLECTIONS.PROJECTS)
  await projectsForClients.createIndex({ clientId: 1 })

  const invites = db.collection(COLLECTIONS.INVITES)
  await invites.createIndex({ token: 1 }, { unique: true })
  await invites.createIndex({ email: 1 })
  await invites.createIndex({ expiresAt: 1 })

  const resets = db.collection(COLLECTIONS.PASSWORD_RESETS)
  await resets.createIndex({ tokenHash: 1 }, { unique: true })
  await resets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  const loginOtps = db.collection(COLLECTIONS.LOGIN_OTPS)
  await loginOtps.createIndex({ email: 1 })
  await loginOtps.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  indexesEnsured = true
  logger.info({ collections: Object.values(COLLECTIONS) }, 'ensured indexes')
}

// Flow Integration Phase 3: assignments indexes (see /flowIntegration.md §4).
// Kept OUT of ensureIndexes() on purpose — the frozen Phase 0 baseline test
// asserts that ensureIndexes() still does not touch `assignments`. Called from
// server.ts + scripts/backfill-assignments.ts instead.
export async function ensureAssignmentIndexes(): Promise<void> {
  const db = await getDb()
  const assignments = db.collection(COLLECTIONS.ASSIGNMENTS)
  await assignments.createIndex({ resourceId: 1 })
  await assignments.createIndex({ projectId: 1 })
  await assignments.createIndex({ clientId: 1 })
  await assignments.createIndex({ status: 1 })
  await assignments.createIndex({ resourceId: 1, projectId: 1, status: 1 })
  logger.info('ensured assignment indexes')
}

// Flow Integration Phase 6 — payrolls indexes (see /flowIntegration.md §4).
// Kept OUT of ensureIndexes() on purpose — the frozen Phase 0 baseline test
// asserts that ensureIndexes() never touches `payrolls`. Called from
// server.ts instead (same pattern as ensureAssignmentIndexes).
// `timesheetId` is UNIQUE: one payroll document per timesheet, enforced at
// the DB level on top of the service's idempotency guard.
export async function ensurePayrollIndexes(): Promise<void> {
  const db = await getDb()
  const payrolls = db.collection(COLLECTIONS.PAYROLLS)
  await payrolls.createIndex({ resourceId: 1 })
  await payrolls.createIndex({ assignmentId: 1 })
  await payrolls.createIndex({ timesheetId: 1 }, { unique: true })
  await payrolls.createIndex({ status: 1 })
  logger.info('ensured payroll indexes')
}

// Flow Integration indexes (see /flowIntegration.md §4). Phase 1 activates
// the clients indexes; later phases activate the rest via
// ensureFlowIntegrationIndexes() (still uncalled) until their backfills.
export async function ensureFlowIntegrationIndexes(): Promise<void> {
  const db = await getDb()

  // NOTE Phase 1: clients indexes now live in ensureIndexes() above.
  // NOTE Phase 3: assignments indexes live in ensureAssignmentIndexes() above
  // (activated, called by server.ts).
  // NOTE Phase 4: timesheets.assignmentId now lives in ensureIndexes() above
  // (activated with the Phase 4 backfill).
  // NOTE Phase 5: invoices.billedTimesheetIds/assignmentId now live in
  // ensureIndexes() above (activated with the Phase 5 backfill).
  // NOTE Phase 6: payrolls indexes live in ensurePayrollIndexes() above
  // (activated with the Phase 6 rollout — new domain, no backfill).
  // This function now activates NOTHING on its own; it is kept exported so
  // any early-phase callers keep compiling.
  await ensureAssignmentIndexes()
  await ensurePayrollIndexes()

  logger.info('ensured flow-integration indexes')
}
