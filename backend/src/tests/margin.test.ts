/// <reference types="vitest" />

// Flow Integration Phase 7 — margin view (checklist 7.1–7.3): the docx §6
// fixture (168h × $110 = $18,480 billed − $10,920 payroll = $7,560, 40.9%),
// assignment/project/period filters, the approved-only default, the shared
// Phase 6 pay-rate chain, non-void invoice scoping, honest-zero behaviour,
// and the admin route.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { createApp } from '../app.js'
// @ts-ignore — supertest ships without types here; same pattern as auth.test.ts
import request from 'supertest'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')

const ADMIN_ID = '507f1f77bcf86cd799439011'
const USER_ID = '507f1f77bcf86cd799439012'

// ─── Minimal in-memory Mongo — FIND-ONLY ─────────────────────────────────────
// Collections expose findOne/find ONLY. getMargin is read-only by contract
// (7.1): if it ever attempted a write (insertOne/updateOne/…), the call would
// throw a TypeError and fail the test — a built-in purity proof. The matcher
// supports the operator set margin uses: ObjectId equality, dotted paths
// (`lines.timesheetId`), $in (incl. over array values), $ne, $gte/$lte.

type Doc = Record<string, any>

function norm(v: unknown): string {
  if (v instanceof ObjectId) return v.toString()
  if (v instanceof Date) return v.toISOString()
  if (v === null || v === undefined) return String(v)
  return String(v)
}

function eq(a: unknown, b: unknown): boolean {
  if (b === null) return a === null || a === undefined
  if (a instanceof ObjectId || b instanceof ObjectId) return norm(a) === norm(b)
  if (a instanceof Date || b instanceof Date) return norm(a) === norm(b)
  return a === b
}

function getPath(doc: Doc, path: string): unknown {
  let current: unknown = doc
  for (const key of path.split('.')) {
    if (current == null) return undefined
    if (Array.isArray(current)) {
      // Mongo dotted-path semantics: descend into EACH array element and
      // flatten (e.g. `lines.timesheetId` → every line's timesheetId).
      current = current.map((el) => (el == null ? undefined : (el as Doc)[key]))
      continue
    }
    current = (current as Doc)[key]
  }
  return current
}

function match(doc: Doc, filter: Doc): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    const value = key.includes('.') ? getPath(doc, key) : doc[key]
    const isOperatorObject =
      cond !== null &&
      typeof cond === 'object' &&
      !(cond instanceof ObjectId) &&
      !(cond instanceof Date) &&
      !Array.isArray(cond)
    if (isOperatorObject) {
      for (const [op, arg] of Object.entries(cond as Doc)) {
        if (op === '$in') {
          // Dotted paths yield an array (e.g. every line's timesheetId): any
          // member matching any argument counts as a hit.
          const candidates = Array.isArray(value) ? value : [value]
          if (!(arg as unknown[]).some((x) => candidates.some((c) => eq(c, x)))) return false
        } else if (op === '$ne') {
          if (eq(value, arg)) return false
        } else if (op === '$gte') {
          if (!(norm(value) >= norm(arg))) return false
        } else if (op === '$lte') {
          if (!(norm(value) <= norm(arg))) return false
        } else {
          return false
        }
      }
    } else if (!eq(value, cond)) {
      return false
    }
  }
  return true
}

function makeDb(): {
  db: any
  raw: Map<string, Doc[]>
  queries: { name: string; filter: Doc }[]
} {
  const stores = new Map<string, Doc[]>()
  const queries: { name: string; filter: Doc }[] = []
  const get = (name: string): Doc[] => {
    if (!stores.has(name)) stores.set(name, [])
    return stores.get(name)!
  }
  const collection = (name: string) => ({
    findOne: async (filter: Doc) => get(name).find((d) => match(d, filter)) ?? null,
    find: (filter: Doc) => {
      queries.push({ name, filter })
      return { toArray: async () => get(name).filter((d) => match(d, filter)) }
    },
  })
  return { db: { collection }, raw: stores, queries }
}

// ─── Fixtures: the docx §6 world (168h, bill $110, pay $65) ─────────────────

function makeWorld(overrides: { assignment?: Doc } = {}) {
  const projectId = new ObjectId()
  const resource: Doc = {
    _id: new ObjectId(),
    name: 'Sony Worker',
    status: 'active',
    role: 'user',
    resourceType: 'w2',
    defaultPayRate: 0,
  }
  const assignment: Doc = {
    _id: new ObjectId(),
    resourceId: resource._id,
    projectId,
    billRate: 110,
    payRate: 65,
    billingType: 'hourly',
    status: 'active',
    ...(overrides.assignment ?? {}),
  }
  const timesheet: Doc = {
    _id: new ObjectId(),
    userId: resource._id,
    projectId,
    assignmentId: assignment._id,
    weekStart: '2026-09-14',
    status: 'approved',
    regularHours: 168,
    overtimeHours: 0,
    totalHours: 168,
    entries: [],
  }
  const invoice: Doc = {
    _id: new ObjectId(),
    invoiceNumber: 'INV-MARGIN-1',
    projectId,
    status: 'sent',
    billedTimesheetIds: [String(timesheet._id)],
    lines: [
      {
        timesheetId: String(timesheet._id),
        assignmentId: String(assignment._id),
        resourceId: String(resource._id),
        weekStart: '2026-09-14',
        hours: 168,
        rate: 110,
        amount: 18480,
        rateSource: 'assignment',
        source: 'approved',
      },
    ],
  }
  return { projectId, resource, assignment, timesheet, invoice }
}

function plant(
  raw: Map<string, Doc[]>,
  world: { resource: Doc; assignment: Doc; timesheet: Doc; invoice?: Doc },
): void {
  raw.set(COLLECTIONS.TIMESHEETS, [...(raw.get(COLLECTIONS.TIMESHEETS) ?? []), world.timesheet])
  raw.set(COLLECTIONS.ASSIGNMENTS, [...(raw.get(COLLECTIONS.ASSIGNMENTS) ?? []), world.assignment])
  raw.set(COLLECTIONS.USERS, [...(raw.get(COLLECTIONS.USERS) ?? []), world.resource])
  if (world.invoice) {
    raw.set(COLLECTIONS.INVOICES, [...(raw.get(COLLECTIONS.INVOICES) ?? []), world.invoice])
  }
}

describe('Phase 7 — margin view (7.1/7.3)', () => {
  afterEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('7.3 docx §6 fixture: 168h → billed $18,480 − cost $10,920 = $7,560 margin (40.9%)', async () => {
    const { db, raw } = makeDb()
    const world = makeWorld()
    plant(raw, world)
    vi.mocked(getDb).mockResolvedValue(db)
    const { getMargin } = await import('../services/margin.service.js')

    const summary = await getMargin({})
    expect(summary).toEqual({
      billableHours: 168,
      billedAmount: 18480,
      payrollCost: 10920,
      grossMargin: 7560,
      marginPct: 40.9,
    })
    // Read-only: the seed sizes are untouched (harness has no write methods —
    // any mutation attempt would have thrown above).
    expect(raw.get(COLLECTIONS.TIMESHEETS)).toHaveLength(1)
    expect(raw.get(COLLECTIONS.INVOICES)).toHaveLength(1)
  })

  it('filters by assignmentId, projectId and from/to period (unbilled world → pct 0)', async () => {
    const { db, raw } = makeDb()
    const a = makeWorld() // 168h @110/65, week 09-14, invoiced 18,480
    const b = makeWorld({ assignment: { billRate: 100, payRate: 40 } }) // distinct project/ids
    b.timesheet.weekStart = '2026-09-21'
    b.timesheet.regularHours = 40
    b.timesheet.totalHours = 40
    plant(raw, a)
    plant(raw, { ...b, invoice: undefined }) // b deliberately has NO invoice (unbilled path)
    vi.mocked(getDb).mockResolvedValue(db)
    const { getMargin } = await import('../services/margin.service.js')

    const byAssignment = await getMargin({ assignmentId: String(a.assignment._id) })
    expect(byAssignment).toEqual({
      billableHours: 168,
      billedAmount: 18480,
      payrollCost: 10920,
      grossMargin: 7560,
      marginPct: 40.9,
    })

    const byProject = await getMargin({ projectId: String(b.projectId) })
    expect(byProject).toEqual({
      billableHours: 40,
      billedAmount: 0, // nothing invoiced yet → pct guards to 0, never NaN
      payrollCost: 1600, // 40 × $40
      grossMargin: 2400, // 40 × (100 − 40)
      marginPct: 0,
    })

    const byPeriod = await getMargin({ from: '2026-09-21', to: '2026-09-27' })
    expect(byPeriod.billableHours).toBe(40)

    const all = await getMargin({})
    expect(all).toEqual({
      billableHours: 208,
      billedAmount: 18480,
      payrollCost: 12520, // 10,920 + 1,600
      grossMargin: 9960, // 7,560 + 2,400
      marginPct: 53.9, // 9,960 / 18,480
    })
  })

  it('defaults to approved; status "all" opts out of the gate', async () => {
    const { db, raw } = makeDb()
    const world = makeWorld()
    plant(raw, world)
    const draft = {
      ...world.timesheet,
      _id: new ObjectId(),
      weekStart: '2026-09-21',
      status: 'draft',
      regularHours: 8,
      totalHours: 8,
    }
    raw.get(COLLECTIONS.TIMESHEETS)!.push(draft)
    vi.mocked(getDb).mockResolvedValue(db)
    const { getMargin } = await import('../services/margin.service.js')

    const approvedOnly = await getMargin({})
    expect(approvedOnly.billableHours).toBe(168) // the draft week is excluded

    const everything = await getMargin({ status: 'all' })
    expect(everything.billableHours).toBe(176)
    expect(everything.payrollCost).toBe(11440) // 10,920 + 8 × 65
    expect(everything.grossMargin).toBe(7920) // 7,560 + 8 × (110 − 65)
  })

  it('payrollCost mirrors the payroll rate chain (assignment → user default → missing)', async () => {
    // Backfilled assignment: payRate 0 is UNSET → falls to the resource default.
    const fallback = makeDb()
    const w1 = makeWorld({ assignment: { payRate: 0 } })
    w1.resource.defaultPayRate = 50
    plant(fallback.raw, w1)
    vi.mocked(getDb).mockResolvedValue(fallback.db)
    const { getMargin } = await import('../services/margin.service.js')
    const viaUser = await getMargin({ assignmentId: String(w1.assignment._id) })
    expect(viaUser.payrollCost).toBe(8400) // 168 × $50 (user default)
    expect(viaUser.grossMargin).toBe(10080) // 168 × (110 − 50)

    // Nothing resolves → $0 cost in this VIEW (documented: inflates margin).
    // The authoritative guard stays Phase 6's payRateMissing block, which
    // stops the actual payment — this view stores no money.
    const missing = makeDb()
    const w2 = makeWorld({ assignment: { payRate: 0 } })
    w2.resource.defaultPayRate = 0
    plant(missing.raw, w2)
    vi.mocked(getDb).mockResolvedValue(missing.db)
    const unresolved = await getMargin({ assignmentId: String(w2.assignment._id) })
    expect(unresolved.payrollCost).toBe(0)
    expect(unresolved.grossMargin).toBe(18480) // 168 × (110 − 0)
  })

  it('void invoices stop counting toward billedAmount (pct guards to 0)', async () => {
    const { db, raw } = makeDb()
    const world = makeWorld()
    world.invoice.status = 'void'
    plant(raw, world)
    vi.mocked(getDb).mockResolvedValue(db)
    const { getMargin } = await import('../services/margin.service.js')

    const summary = await getMargin({})
    expect(summary.billedAmount).toBe(0)
    expect(summary.marginPct).toBe(0)
    expect(summary.grossMargin).toBe(7560) // rate math is independent of billing
  })

  it('backfilled billRate:0 (unset) surfaces as NEGATIVE margin — no silent zero hiding', async () => {
    const { db, raw } = makeDb()
    const world = makeWorld({ assignment: { billRate: 0 } })
    plant(raw, { ...world, invoice: undefined }) // nothing billed
    vi.mocked(getDb).mockResolvedValue(db)
    const { getMargin } = await import('../services/margin.service.js')

    const summary = await getMargin({})
    expect(summary.billableHours).toBe(168)
    expect(summary.grossMargin).toBe(-10920) // 168 × (0 − 65): visibly wrong
    expect(summary.billedAmount).toBe(0)
    expect(summary.marginPct).toBe(0)
  })

  it('empty dataset returns a zeroed summary (no NaN/Infinity)', async () => {
    const { db } = makeDb()
    vi.mocked(getDb).mockResolvedValue(db)
    const { getMargin } = await import('../services/margin.service.js')

    const summary = await getMargin({})
    expect(summary).toEqual({
      billableHours: 0,
      billedAmount: 0,
      payrollCost: 0,
      grossMargin: 0,
      marginPct: 0,
    })
    expect(Number.isNaN(summary.marginPct)).toBe(false)
    expect(Number.isFinite(summary.marginPct)).toBe(true)
  })
})

describe('GET /api/v1/reports/margin (7.2)', () => {
  let harness: ReturnType<typeof makeDb>
  let world: ReturnType<typeof makeWorld>

  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    vi.mocked(verifyAccessToken).mockReset()
    harness = makeDb()
    world = makeWorld()
    plant(harness.raw, world)
    // Admin identity for authenticate (findOne {_id, status:'active'}).
    harness.raw.set(COLLECTIONS.USERS, [
      ...harness.raw.get(COLLECTIONS.USERS)!,
      {
        _id: new ObjectId(ADMIN_ID),
        name: 'Ada Admin',
        email: 'admin@example.com',
        status: 'active',
        role: 'admin',
        isSupervisor: false,
      },
    ])
    vi.mocked(getDb).mockResolvedValue(harness.db)
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: ADMIN_ID,
      role: 'admin',
      isSupervisor: false,
      exp: 9999999999,
    } as any)
  })

  it('returns the fixture summary with an approved-default match built from from/to + assignmentId', async () => {
    const res = await request(createApp())
      .get('/api/v1/reports/margin')
      .set('Authorization', 'Bearer valid-token')
      .query({ assignmentId: String(world.assignment._id), from: '2026-09-01', to: '2026-09-30' })

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      billableHours: 168,
      billedAmount: 18480,
      payrollCost: 10920,
      grossMargin: 7560,
      marginPct: 40.9,
    })

    // Query-plan assertions: the route really is buildMatchStage with the
    // Phase 7 default status, from/to → weekStart range, + assignmentId.
    const tsQuery = harness.queries.find((q) => q.name === COLLECTIONS.TIMESHEETS)
    expect(tsQuery).toBeDefined()
    expect(tsQuery!.filter.status).toBe('approved') // 7.2 default
    expect(String(tsQuery!.filter.assignmentId)).toBe(String(world.assignment._id))
    expect(tsQuery!.filter.weekStart).toEqual({ $gte: '2026-09-01', $lte: '2026-09-30' })
  })

  it('403 for non-admin users', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      userId: USER_ID,
      role: 'user',
      isSupervisor: false,
      exp: 9999999999,
    } as any)
    harness.raw.set(COLLECTIONS.USERS, [
      ...harness.raw.get(COLLECTIONS.USERS)!,
      {
        _id: new ObjectId(USER_ID),
        name: 'Regular User',
        email: 'user@example.com',
        status: 'active',
        role: 'user',
        isSupervisor: false,
      },
    ])

    const res = await request(createApp())
      .get('/api/v1/reports/margin')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(403)
  })

  it('401 without a token', async () => {
    const res = await request(createApp()).get('/api/v1/reports/margin')
    expect(res.status).toBe(401)
  })
})



