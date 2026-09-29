// ts.md Phase 8 — End-to-end integration for the daily → weekly timesheet flow.
//
// Phases 1–7 were each verified on their own: the logger (1–2), the compiler
// (3), the HTTP surface (4), the lock cascade (5), invoices (Flow Phase 5),
// payroll (6) and margin (7). The failures that matter in a timesheet product
// live at the SEAMS between those layers, and none of the isolated suites can
// see them: a day that lands in the wrong weekly bucket, a parent total that
// silently drifts from its children, an invoice line that no longer traces back
// to a timesheet, or payroll paying hours nobody logged.
//
// So these tests drive the real HTTP surface (`/api/v1`, authenticate, access
// guards, Zod, controllers, services, one in-memory Mongo) and assert the
// numbers at every hop:
//
//   8.1  5 × 8h daily logs → 40h draft week → submit → approve → invoice
//        (lines + totals) → payroll → margin, including the audit trail and the
//        lineage keys every money row must carry.
//   8.2  the same money for a weekly timesheet created through the legacy
//        `POST /timesheets` API with ZERO daily rows — plus the invoice PDF.
//
// The Mongo stand-in extends flow-phase9.test.ts's matcher (dotted paths,
// operator objects, `$or`/`$and`) with the write verbs this flow needs:
// `updateMany` (compile linking + lock cascade), `$inc` upsert (the invoice
// counter) and real sorting (the compiler reads days in date order).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
// @ts-expect-error — supertest ships without types here; same pattern as auth.test.ts
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { COLLECTIONS } from '../lib/collections.js'
import { invalidateUserCache } from '../middleware/auth.js'
import { CASCADE_LOCK_MESSAGE } from '../services/daily-timesheet-lock.service.js'
import { buildInvoicePdf } from '../services/invoice-pdf.service.js'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')

const ORIGINAL_PHASE = process.env.FLOW_INTEGRATION_PHASE

const ADMIN = '507f1f77bcf86cd7994390d4'
const SUPERVISOR = '507f1f77bcf86cd7994390c3'
const EMPLOYEE_A = '507f1f77bcf86cd7994390a1'
const EMPLOYEE_B = '507f1f77bcf86cd7994390b2'
const CLIENT = '507f1f77bcf86cd799439041'
const PROJECT = '507f1f77bcf86cd7994390f6'
const PROJECT_SIDE = '507f1f77bcf86cd7994390f7'
const ASG_A = '507f1f77bcf86cd799439051'
const ASG_B = '507f1f77bcf86cd799439052'
const ASG_A_SIDE = '507f1f77bcf86cd799439053'

/** 2026-09-28 is a Monday, so this week is Mon–Fri with no weekend spillover. */
const WEEK = '2026-09-28'
const MON = '2026-09-28'
const TUE = '2026-09-29'
const WED = '2026-09-30'
const THU = '2026-10-01'
const FRI = '2026-10-02'
const SAT = '2026-10-03'
const WEEK_DAYS = [MON, TUE, WED, THU, FRI]

const BILL_RATE_A = 110
const PAY_RATE_A = 65
const BILL_RATE_B = 120
const PAY_RATE_B = 70

type Doc = Record<string, any>

// ─── In-memory Mongo ────────────────────────────────────────────────────────

/** Mongo dotted-path traversal, flattening as it descends into arrays. */
function getPath(doc: Doc, path: string): unknown {
  let current: unknown = doc
  for (const key of path.split('.')) {
    if (current == null) return undefined
    if (Array.isArray(current)) {
      current = current.map((el) => (el == null ? undefined : (el as Doc)[key]))
      continue
    }
    current = (current as Doc)[key]
  }
  return current
}

function compareValues(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((value) => String(value) === String(expected))
  return String(actual) === String(expected)
}

function matches(doc: Doc, query: Doc): boolean {
  for (const [key, expected] of Object.entries(query)) {
    if (key === '$and') {
      if (!(expected as Doc[]).every((sub) => matches(doc, sub))) return false
      continue
    }
    if (key === '$or') {
      if (!(expected as Doc[]).some((sub) => matches(doc, sub))) return false
      continue
    }
    const actual = getPath(doc, key)
    const isOperatorBag =
      expected !== null &&
      typeof expected === 'object' &&
      !(expected instanceof ObjectId) &&
      !(expected instanceof Date) &&
      !Array.isArray(expected)
    if (isOperatorBag) {
      const values = Array.isArray(actual) ? actual : [actual]
      let passed = true
      for (const [operator, argument] of Object.entries(expected as Doc)) {
        // Mongo semantics: the row matches if ANY of its (possibly array-
        // flattened) values satisfies the operator against ANY of `$in`'s.
        const anyOf = (values: unknown[], candidates: unknown[]) =>
          candidates.some((candidate) => values.some((value) => String(value) === String(candidate)))
        if (operator === '$ne' && values.some((v) => String(v) === String(argument))) passed = false
        if (operator === '$in' && !anyOf(values, argument as unknown[])) passed = false
        if (operator === '$nin' && anyOf(values, argument as unknown[])) passed = false
        if (operator === '$gte' && String(actual) < String(argument)) passed = false
        if (operator === '$lte' && String(actual) > String(argument)) passed = false
        if (operator === '$gt' && String(actual) <= String(argument)) passed = false
        if (operator === '$lt' && String(actual) >= String(argument)) passed = false
        if (operator === '$exists' && (actual !== undefined) !== argument) passed = false
      }
      if (!passed) return false
    } else if (expected === null) {
      if (actual !== null && actual !== undefined) return false
    } else if (!compareValues(actual, expected)) return false
  }
  return true
}

function sortValue(value: unknown): string | number {
  if (value instanceof ObjectId || value instanceof Date) return String(value)
  if (typeof value === 'number') return value
  return String(value)
}

function applySort(rows: Doc[], spec?: Record<string, 1 | -1>): Doc[] {
  const keys = Object.entries(spec ?? {})
  if (keys.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const [key, direction] of keys) {
      const left = sortValue(getPath(a, key))
      const right = sortValue(getPath(b, key))
      if (left !== right) return (left < right ? -1 : 1) * direction
    }
    return 0
  })
}

/** Applies `$set` / `$inc` / `$unset` the way the driver would. */
function applyUpdate(target: Doc, update: Doc): Doc {
  const next = { ...target }
  for (const [field, value] of Object.entries(update.$set ?? {})) next[field] = value
  for (const [field, value] of Object.entries(update.$inc ?? {})) {
    next[field] = (typeof next[field] === 'number' ? next[field] : 0) + (value as number)
  }
  for (const field of Object.keys(update.$unset ?? {})) delete next[field]
  return next
}

/** Equality terms of a filter — the shape an upserted document starts with. */
function equalitySeed(filter: Doc): Doc {
  const seed: Doc = {}
  for (const [key, value] of Object.entries(filter)) {
    if (value === null || typeof value !== 'object' || value instanceof ObjectId || value instanceof Date) {
      seed[key] = value
    }
  }
  return seed
}


/** One collection: an array of docs plus the verbs every service uses. */
function makeCollection(items: Doc[] = []) {
  const col: any = {
    items,
    insertOne: vi.fn(async (doc: Doc) => {
      const inserted = { _id: new ObjectId(), ...doc }
      items.push(inserted)
      return { insertedId: inserted._id, acknowledged: true }
    }),
    findOne: vi.fn(async (filter: Doc = {}) => items.find((doc) => matches(doc, filter)) ?? null),
    find: vi.fn((filter: Doc = {}, options?: { sort?: Record<string, 1 | -1> }) => {
      let spec = options?.sort
      let offset = 0
      let limit = Infinity
      const rows = () => applySort(items.filter((doc) => matches(doc, filter)), spec).slice(offset, offset + limit)
      const cursor: any = {
        sort: vi.fn((next: Record<string, 1 | -1>) => {
          spec = next
          return cursor
        }),
        skip: vi.fn((next: number) => {
          offset = next
          return cursor
        }),
        limit: vi.fn((next: number) => {
          limit = next
          return cursor
        }),
        toArray: vi.fn(async () => rows()),
      }
      return cursor
    }),
    countDocuments: vi.fn(async (filter: Doc = {}) => items.filter((doc) => matches(doc, filter)).length),
    updateOne: vi.fn(async (filter: Doc, update: Doc) => {
      const index = items.findIndex((doc) => matches(doc, filter))
      if (index === -1) return { matchedCount: 0, modifiedCount: 0 }
      items[index] = applyUpdate(items[index], update)
      return { matchedCount: 1, modifiedCount: 1 }
    }),
    updateMany: vi.fn(async (filter: Doc, update: Doc) => {
      let modified = 0
      items.forEach((doc, index) => {
        if (!matches(doc, filter)) return
        items[index] = applyUpdate(doc, update)
        modified += 1
      })
      return { matchedCount: modified, modifiedCount: modified }
    }),
    // `returnDocument: 'after'` is the only mode the services ask for; the
    // driver's ModifyResult unwrapping is mocked away the same way the rest of
    // the suite does it (return the document itself).
    findOneAndUpdate: vi.fn(async (filter: Doc, update: Doc, options: Doc = {}) => {
      const index = items.findIndex((doc) => matches(doc, filter))
      if (index === -1) {
        if (!options.upsert) return null
        const created = applyUpdate(equalitySeed(filter), update)
        created._id = new ObjectId()
        items.push(created)
        return created
      }
      items[index] = applyUpdate(items[index], update)
      return items[index]
    }),
    deleteOne: vi.fn(async (filter: Doc) => {
      const index = items.findIndex((doc) => matches(doc, filter))
      if (index === -1) return { deletedCount: 0 }
      items.splice(index, 1)
      return { deletedCount: 1 }
    }),
    deleteMany: vi.fn(async (filter: Doc) => {
      let deleted = 0
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (!matches(items[index], filter)) continue
        items.splice(index, 1)
        deleted += 1
      }
      return { deletedCount: deleted }
    }),
  }
  return col
}

/** Seeds the db, points `getDb` at it, and hands back the live stores. */
function useDb(seed: Record<string, Doc[]> = {}) {
  const stores: Record<string, Doc[]> = {}
  for (const name of Object.values(COLLECTIONS)) stores[name] = []
  for (const [name, docs] of Object.entries(seed)) stores[name].push(...docs)
  const collections: Record<string, any> = {}
  const collection = vi.fn((name: string) => {
    if (!collections[name]) {
      // The backing array IS the store's array, so a test that grabbed
      // `stores[name]` up front still sees every later insert/update/delete.
      if (!stores[name]) stores[name] = []
      collections[name] = makeCollection(stores[name])
    }
    return collections[name]
  })
  vi.mocked(getDb).mockResolvedValue({ collection } as never)
  return stores
}

/** Live rows of a collection (never cache one: write ops replace documents). */
function rows(stores: Record<string, Doc[]>, name: string): Doc[] {
  return stores[name] ?? []
}


// ─── Fixtures ───────────────────────────────────────────────────────────────

function userDoc(id: string, name: string, role: string, isSupervisor: boolean, opts: Doc = {}): Doc {
  return {
    _id: new ObjectId(id),
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    name,
    employeeId: id.slice(-6),
    department: 'Engineering',
    role,
    isSupervisor,
    status: 'active',
    resourceType: 'w2',
    payType: 'hourly',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...opts,
  }
}

function projectDoc(opts: Doc): Doc {
  return {
    status: 'active',
    managerId: new ObjectId(ADMIN),
    supervisorId: new ObjectId(SUPERVISOR),
    clientId: new ObjectId(CLIENT),
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    teamMemberIds: [new ObjectId(EMPLOYEE_A), new ObjectId(EMPLOYEE_B)],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...opts,
  }
}

function assignmentDoc(id: string, resourceId: string, projectId: string, billRate: number, payRate: number): Doc {
  return {
    _id: new ObjectId(id),
    resourceId: new ObjectId(resourceId),
    projectId: new ObjectId(projectId),
    clientId: new ObjectId(CLIENT),
    poSow: 'SIE-2026-001',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    billRate,
    payRate,
    billingType: 'hourly',
    timesheetRequired: true,
    approvalRequired: true,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

/** The org every test starts from: admin, supervisor, two reports, two projects. */
function baseSeed(): Record<string, Doc[]> {
  return {
    [COLLECTIONS.USERS]: [
      userDoc(ADMIN, 'Ada Admin', 'admin', false),
      userDoc(SUPERVISOR, 'Sam Supervisor', 'user', true),
      userDoc(EMPLOYEE_A, 'Asha Engineer', 'user', false, { supervisorId: new ObjectId(SUPERVISOR) }),
      userDoc(EMPLOYEE_B, 'Ben Builder', 'user', false, { supervisorId: new ObjectId(SUPERVISOR) }),
    ],
    [COLLECTIONS.PROJECTS]: [
      projectDoc({ _id: new ObjectId(PROJECT), name: 'Sony', client: 'Sony', sowNumber: 'SIE-2026-001', hourlyRate: BILL_RATE_A }),
      projectDoc({ _id: new ObjectId(PROJECT_SIDE), name: 'Helios', client: 'Helios', sowNumber: 'HEL-2026-002', hourlyRate: 90 }),
    ],
    [COLLECTIONS.ASSIGNMENTS]: [
      assignmentDoc(ASG_A, EMPLOYEE_A, PROJECT, BILL_RATE_A, PAY_RATE_A),
      assignmentDoc(ASG_B, EMPLOYEE_B, PROJECT, BILL_RATE_B, PAY_RATE_B),
      assignmentDoc(ASG_A_SIDE, EMPLOYEE_A, PROJECT_SIDE, 90, 60),
    ],
  }
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

/** Stubs the bearer token; `authenticate` still re-reads the user row. */
function signIn(userId: string, role: string, isSupervisor = false) {
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role, isSupervisor, exp: 9_999_999_999 } as any)
}

function authed(req: any) {
  return req.set('Authorization', 'Bearer test-token')
}

const asUser = (app: any, userId: string, role: string, isSupervisor = false) => {
  signIn(userId, role, isSupervisor)
  return app
}

/** Logs one day through the real daily-logger route. */
function logDay(
  app: any,
  body: { projectId?: string; date: string; hours: number; entryType?: string; description: string },
) {
  return authed(
    request(app)
      .post('/api/v1/timesheets/daily')
      .send({ entryType: 'regular', projectId: PROJECT, ...body }),
  )
}

/** The single weekly parent compiled so far for one employee/project pair. */
function parentOf(stores: Record<string, Doc[]>, index = 0): Doc {
  const parents = rows(stores, COLLECTIONS.TIMESHEETS)
  const parent = parents[index]
  if (!parent) throw new Error(`No weekly timesheet compiled (have ${parents.length})`)
  return parent
}

function daysOf(stores: Record<string, Doc[]>): Doc[] {
  return rows(stores, COLLECTIONS.DAILY_TIMESHEETS)
}

/** pdfkit 0.20 draws text as WinAnsi hex runs; decoding them rebuilds the page. */
function decodePdfText(pdf: Buffer): string {
  return [...pdf.toString('latin1').matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('')
}

beforeEach(() => {
  // Production runs `FLOW_INTEGRATION_PHASE=full` (backend/.env): assignment
  // links are mandatory on new timesheets and invoices bill approved hours
  // only. The E2E therefore asserts the production default, not a flag-off one.
  process.env.FLOW_INTEGRATION_PHASE = 'full'
  vi.mocked(verifyAccessToken).mockReset()
  vi.mocked(getDb).mockReset()
  for (const id of [ADMIN, SUPERVISOR, EMPLOYEE_A, EMPLOYEE_B]) invalidateUserCache(id)
})

afterEach(() => {
  if (ORIGINAL_PHASE === undefined) delete process.env.FLOW_INTEGRATION_PHASE
  else process.env.FLOW_INTEGRATION_PHASE = ORIGINAL_PHASE
  vi.clearAllMocks()
})


// ─── 8.1 · daily logs → weekly timesheet → approval → money ─────────────────

describe('ts.md 8.1 — daily logs drive the weekly timesheet all the way to the money', () => {
  it('walks one week from five 8h daily logs to invoice, payroll and margin', async () => {
    const stores = useDb(baseSeed())
    const app = asUser(createApp(), EMPLOYEE_A, 'user')

    // ── Step 1 · log Mon–Fri, 8h each, through the daily-logger route.
    for (const date of WEEK_DAYS) {
      const logged = await logDay(app, { date, hours: 8, description: `Log ${date}` })
      expect(logged.status).toBe(201)
      expect(logged.body.dailyTimesheet.hours).toBe(8)
    }
    expect(daysOf(stores).map((day) => day.date)).toEqual(WEEK_DAYS)
    expect(daysOf(stores).every((day) => day.status === 'draft')).toBe(true)

    // The auto-compile hook aggregated them into exactly one DRAFT parent (8.1
    // step 2's expected state) rather than forking a week per day.
    expect(rows(stores, COLLECTIONS.TIMESHEETS)).toHaveLength(1)
    expect(parentOf(stores).status).toBe('draft')
    expect(parentOf(stores).weekStart).toBe(WEEK)
    expect(parentOf(stores).totalHours).toBe(40)

    // ── Step 2 · the explicit compile is idempotent and links every child.
    const compiled = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT, weekStart: WEEK }),
    )
    expect(compiled.status).toBe(200)
    expect(compiled.body.timesheet).toMatchObject({
      weekStart: WEEK,
      status: 'draft',
      regularHours: 40,
      overtimeHours: 0,
      totalHours: 40,
      assignmentId: ASG_A,
      projectId: PROJECT,
      userId: EMPLOYEE_A,
    })
    const [regular] = compiled.body.timesheet.entries
    expect(regular.entryType).toBe('regular')
    expect(regular.hours).toEqual({ mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 })
    // The per-day notes survive aggregation, in date order — the audit trail a
    // reviewer reads is the one the worker typed.
    expect(regular.description).toBe(
      WEEK_DAYS.map((date, i) => `[${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i]}] Log ${date}`).join('; '),
    )
    expect(rows(stores, COLLECTIONS.TIMESHEETS)).toHaveLength(1)

    const parentId = parentOf(stores)._id.toString()
    for (const day of daysOf(stores)) {
      expect(day.weeklyTimesheetId.toString()).toBe(parentId)
      expect(day.assignmentId.toString()).toBe(ASG_A)
    }

    // Modifying a day re-compiles the parent in place (8.1 step 2's "any
    // modification triggers recompile")…
    const tuesday = daysOf(stores).find((day) => day.date === TUE)!
    const trimmed = await authed(
      request(app).patch(`/api/v1/timesheets/daily/${tuesday._id}`).send({ hours: 4 }),
    )
    expect(trimmed.status).toBe(200)
    expect(parentOf(stores).totalHours).toBe(36)

    // …and so does deleting one. Re-posting the deleted day lands the week back
    // at 40h — with the SAME parent, so nothing forks.
    const friday = daysOf(stores).find((day) => day.date === FRI)!
    expect((await authed(request(app).delete(`/api/v1/timesheets/daily/${friday._id}`))).status).toBe(204)
    expect(parentOf(stores).totalHours).toBe(28)
    await authed(request(app).patch(`/api/v1/timesheets/daily/${tuesday._id}`).send({ hours: 8 }))
    expect(parentOf(stores).totalHours).toBe(32)
    expect((await logDay(app, { date: FRI, hours: 8, description: 'Log 2026-10-02' })).status).toBe(201)
    expect(daysOf(stores)).toHaveLength(5)
    expect(parentOf(stores).totalHours).toBe(40)
    expect(rows(stores, COLLECTIONS.TIMESHEETS)).toHaveLength(1)


    // ── Step 3 · submit freezes the week AND every compiled day (8.1 step 3).
    const submitted = await authed(request(app).post(`/api/v1/timesheets/${parentId}/submit`))
    expect(submitted.status).toBe(200)
    expect(submitted.body.timesheet.status).toBe('pending')
    expect(daysOf(stores).map((day) => day.status)).toEqual(WEEK_DAYS.map(() => 'locked'))

    const lateEdit = await authed(
      request(app).patch(`/api/v1/timesheets/daily/${tuesday._id}`).send({ hours: 1 }),
    )
    expect(lateEdit.status).toBe(409)
    expect(lateEdit.body.error.message).toBe(CASCADE_LOCK_MESSAGE)
    const lateDay = await logDay(app, { date: SAT, hours: 3, entryType: 'overtime', description: 'Weekend push' })
    expect(lateDay.status).toBe(409)
    expect(daysOf(stores)).toHaveLength(5)

    // The parent refuses to be recompiled out from under the reviewer, so the
    // 40h snapshot they were handed is the one that gets decided on.
    const lateCompile = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT, weekStart: WEEK }),
    )
    expect(lateCompile.status).toBe(400)
    expect(lateCompile.body.error.message).toContain('Cannot compile into timesheet in pending status')
    expect(parentOf(stores).totalHours).toBe(40)

    // ── Step 4 · approve locks the parent and keeps the children frozen.
    asUser(app, SUPERVISOR, 'user', true)
    const approved = await authed(request(app).post(`/api/v1/approvals/${parentId}/approve`))
    expect(approved.status).toBe(200)
    expect(approved.body.timesheet.status).toBe('approved')
    expect(approved.body.timesheet.isLocked).toBe(true)
    expect(parentOf(stores).review.reviewedBy.toString()).toBe(SUPERVISOR)
    expect(daysOf(stores).every((day) => day.status === 'locked')).toBe(true)

    asUser(app, EMPLOYEE_A, 'user')
    const frozen = await authed(request(app).patch(`/api/v1/timesheets/daily/${tuesday._id}`).send({ hours: 1 }))
    expect(frozen.status).toBe(409)
    expect(frozen.body.error.message).toBe(CASCADE_LOCK_MESSAGE)
    // The admin override stops at the cascade: an approved week is immutable.
    asUser(app, ADMIN, 'admin')
    expect(
      (await authed(request(app).delete(`/api/v1/timesheets/daily/${tuesday._id}`))).status,
    ).toBe(409)
    expect(daysOf(stores)).toHaveLength(5)

    // Audit trail: both review transitions are on the record, for the right week.
    const activities = rows(stores, COLLECTIONS.ACTIVITIES)
    expect(activities.map((row) => row.description)).toEqual(
      expect.arrayContaining([
        'Asha Engineer submitted a timesheet for Sony.',
        'Sam Supervisor approved a timesheet for Sony.',
      ]),
    )
    expect(activities.filter((row) => row.timesheetId?.toString() === parentId).length).toBeGreaterThanOrEqual(2)
    const notices = rows(stores, COLLECTIONS.NOTIFICATIONS).map((row) => row.title)
    expect(notices).toContain('Timesheet Submitted for Review')
    expect(notices).toContain('Timesheet Approved')

    // ── Step 5 · invoice: the 40 approved hours become exactly one traceable line.
    const invoiced = await authed(
      request(app).post('/api/v1/invoices').send({ projectId: PROJECT, assignmentId: ASG_A }),
    )
    expect(invoiced.status).toBe(201)
    const invoice = invoiced.body.invoice
    expect(invoice).toMatchObject({
      status: 'draft',
      approvedOnly: true,
      projectId: PROJECT,
      assignmentId: ASG_A,
      billableHours: 40,
      fixedCost: 4400,
      total: 4400,
    })
    expect(invoice.periodLabel).toContain('2026')
    expect(invoice.lines).toHaveLength(1)
    expect(invoice.lines[0]).toMatchObject({
      timesheetId: parentId,
      assignmentId: ASG_A,
      resourceId: EMPLOYEE_A,
      weekStart: WEEK,
      hours: 40,
      rate: BILL_RATE_A,
      amount: BILL_RATE_A * 40,
      rateSource: 'assignment',
      source: 'approved',
    })
    expect(invoice.billedTimesheetIds).toEqual([parentId])

    // ── Step 6 · payroll + margin read the same 40 hours, never a copy of them.
    const preview = await authed(request(app).get(`/api/v1/payrolls/preview?timesheetId=${parentId}`))
    expect(preview.status).toBe(200)
    expect(preview.body.preview).toMatchObject({
      timesheetId: parentId,
      timesheetStatus: 'approved',
      hours: 40,
      regularHours: 40,
      overtimeHours: 0,
      payRate: PAY_RATE_A,
      payRateSource: 'assignment',
      payRateMissing: false,
      grossPay: PAY_RATE_A * 40,
      type: 'w2',
    })
    // 6.3's promise still holds inside a full lifecycle: preview writes nothing.
    expect(rows(stores, COLLECTIONS.PAYROLLS)).toHaveLength(0)

    const payroll = await authed(request(app).post('/api/v1/payrolls/from-timesheet').send({ timesheetId: parentId }))
    expect(payroll.status).toBe(201)
    expect(payroll.body.payroll).toMatchObject({
      timesheetId: parentId,
      resourceId: EMPLOYEE_A,
      projectId: PROJECT,
      periodStart: WEEK,
      periodEnd: '2026-10-04',
      hours: 40,
      payRate: PAY_RATE_A,
      grossPay: PAY_RATE_A * 40,
      status: 'draft',
    })

    // ── 8.1's integrity promise: children, parent, bill and payslip agree.
    const paid = await authed(request(app).post('/api/v1/payrolls/from-timesheet').send({ timesheetId: parentId }))
    expect(paid.body.payroll.id).toBe(payroll.body.payroll.id)
    expect(rows(stores, COLLECTIONS.PAYROLLS)).toHaveLength(1)
    const hoursLogged = daysOf(stores).reduce((sum, day) => sum + day.hours, 0)
    expect(hoursLogged).toBe(parentOf(stores).totalHours)
    expect(invoice.lines.reduce((sum: number, line: Doc) => sum + (line.hours as number), 0)).toBe(hoursLogged)
    expect(rows(stores, COLLECTIONS.PAYROLLS)[0].hours).toBe(hoursLogged)

    const margin = await authed(
      request(app).get(`/api/v1/reports/margin?projectId=${PROJECT}&assignmentId=${ASG_A}&from=${WEEK}&to=${WEEK}`),
    )
    expect(margin.status).toBe(200)
    expect(margin.body.data).toEqual({
      billableHours: 40,
      billedAmount: BILL_RATE_A * 40,
      payrollCost: PAY_RATE_A * 40,
      grossMargin: (BILL_RATE_A - PAY_RATE_A) * 40,
      marginPct: 40.9,
    })
  })
})

// ─── 8.2 · legacy weekly timesheet (no daily rows) → approval → money ───────

describe('ts.md 8.2 — a legacy weekly timesheet still reaches approval, invoice and PDF', () => {
  it('bills, pays and renders a week that was never logged day-by-day', async () => {
    const stores = useDb(baseSeed())
    const app = asUser(createApp(), EMPLOYEE_A, 'user')

    // ── Legacy shape: one Mon–Fri 8h entry posted straight to /timesheets.
    // No daily rows exist for this week and none ever will — the pre-Phase-3
    // client keeps working byte-for-byte (`id` per entry, no daily lineage).
    const created = await authed(
      request(app)
        .post('/api/v1/timesheets')
        .send({
          projectId: PROJECT,
          assignmentId: ASG_A,
          weekStart: WEEK,
          notes: 'Legacy week — logged in the weekly grid',
          entries: [
            {
              id: 'legacy-entry-1',
              description: 'Sprint 41 — API hardening',
              entryType: 'regular',
              hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
            },
          ],
        }),
    )
    expect(created.status).toBe(201)
    const legacyId = created.body.timesheet.id
    expect(created.body.timesheet).toMatchObject({
      status: 'draft',
      weekStart: WEEK,
      projectId: PROJECT,
      assignmentId: ASG_A,
      userId: EMPLOYEE_A,
      regularHours: 40,
      overtimeHours: 0,
      totalHours: 40,
    })
    expect(created.body.timesheet.entries[0].description).toBe('Sprint 41 — API hardening')

    // The legacy write path never touches `daily_timesheets`: there is nothing
    // to compile and therefore nothing to cascade-link.
    expect(daysOf(stores)).toHaveLength(0)

    // ── Submit → pending. With no children there is nothing to freeze, so the
    // parent alone carries the immutable 40h snapshot into review.
    const submitted = await authed(request(app).post(`/api/v1/timesheets/${legacyId}/submit`))
    expect(submitted.status).toBe(200)
    expect(submitted.body.timesheet.status).toBe('pending')
    expect(daysOf(stores)).toHaveLength(0)

    // ── Approve → locked, exactly like a compiled week.
    asUser(app, SUPERVISOR, 'user', true)
    const approved = await authed(request(app).post(`/api/v1/approvals/${legacyId}/approve`))
    expect(approved.status).toBe(200)
    expect(approved.body.timesheet.status).toBe('approved')
    expect(approved.body.timesheet.isLocked).toBe(true)
    expect(parentOf(stores).review.reviewedBy.toString()).toBe(SUPERVISOR)
    expect(daysOf(stores)).toHaveLength(0)

    // The lock cascade still protects the approved week from the NEW daily
    // surface: a day for the same resource/project/week is rejected by the
    // week-level twin of the per-entry guard, so the two clients can never
    // disagree about what was worked.
    asUser(app, EMPLOYEE_A, 'user')
    const lateDay = await logDay(app, { date: WED, hours: 8, description: 'Backfill after approval' })
    expect(lateDay.status).toBe(409)
    expect(lateDay.body.error.message).toBe(CASCADE_LOCK_MESSAGE)
    expect(daysOf(stores)).toHaveLength(0)

    // ── Invoice: the approved-only path bills the legacy week 1:1, with the
    // same lineage keys a compiled week produces.
    asUser(app, ADMIN, 'admin')
    const invoiced = await authed(
      request(app).post('/api/v1/invoices').send({ projectId: PROJECT, assignmentId: ASG_A }),
    )
    expect(invoiced.status).toBe(201)
    const invoice = invoiced.body.invoice
    expect(invoice).toMatchObject({
      status: 'draft',
      approvedOnly: true,
      projectId: PROJECT,
      assignmentId: ASG_A,
      billableHours: 40,
      fixedCost: BILL_RATE_A * 40,
      total: BILL_RATE_A * 40,
    })
    expect(invoice.lines).toHaveLength(1)
    expect(invoice.lines[0]).toMatchObject({
      timesheetId: legacyId,
      assignmentId: ASG_A,
      resourceId: EMPLOYEE_A,
      weekStart: WEEK,
      hours: 40,
      rate: BILL_RATE_A,
      amount: BILL_RATE_A * 40,
      rateSource: 'assignment',
      source: 'approved',
    })
    expect(invoice.billedTimesheetIds).toEqual([legacyId])
    expect(daysOf(stores)).toHaveLength(0)

    // ── PDF over the real HTTP route: correct headers and a structurally valid
    // document rendered from the invoice's own stored bytes.
    const pdfResponse = await authed(request(app).get(`/api/v1/invoices/${invoice.id}/pdf`))
    expect(pdfResponse.status).toBe(200)
    expect(String(pdfResponse.headers['content-type'])).toContain('application/pdf')
    expect(String(pdfResponse.headers['content-disposition'])).toContain(`${invoice.invoiceNumber}.pdf`)
    const rendered = Buffer.isBuffer(pdfResponse.body)
      ? pdfResponse.body
      : Buffer.from(pdfResponse.body as unknown as string, 'latin1')
    expect(rendered.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(rendered.toString('latin1')).toContain('%%EOF')
    expect(rendered.length).toBeGreaterThan(1500)

    // The route compresses its streams, so re-render the SAME stored invoice
    // uncompressed (with the project enrichment the controller adds) to read
    // the drawn text and pin the money and the lineage.
    const decoded = decodePdfText(
      await buildInvoicePdf(
        { invoice, clientName: 'Sony', sowNumber: 'SIE-2026-001', issuedOn: new Date(invoice.createdAt) },
        { compress: false },
      ),
    )
    expect(decoded).toContain('ENIAC INC.')
    expect(decoded).toContain('STATEMENT OF SERVICES')
    expect(decoded).toContain(invoice.invoiceNumber)
    expect(decoded).toContain('Sony')
    expect(decoded).toContain('SOW SIE-2026-001')
    expect(decoded).toContain('1 TIMESHEET LINE')
    expect(decoded).toContain(WEEK)
    expect(decoded).toContain('$4,400.00')
    expect(decoded).toContain('Total due (USD)')
    // A draft is watermarked and not yet issued — the legacy week still renders
    // through the same document the daily-compiled weeks do.
    expect(decoded).toContain('DRAFT')
    expect(decoded).toContain('NOT YET ISSUED')

    // ── Payroll reads the same approved week off the shared snapshot, and the
    // week still has zero daily rows: legacy and daily-to-weekly converge only
    // at the weekly parent.
    const preview = await authed(request(app).get(`/api/v1/payrolls/preview?timesheetId=${legacyId}`))
    expect(preview.status).toBe(200)
    expect(preview.body.preview).toMatchObject({
      timesheetId: legacyId,
      timesheetStatus: 'approved',
      hours: 40,
      regularHours: 40,
      overtimeHours: 0,
      payRate: PAY_RATE_A,
      payRateSource: 'assignment',
      grossPay: PAY_RATE_A * 40,
    })
    expect(daysOf(stores)).toHaveLength(0)
    expect(rows(stores, COLLECTIONS.TIMESHEETS)).toHaveLength(1)
  })
})

