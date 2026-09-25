/// <reference types="vitest" />

// Flow Integration Phase 6 — payroll domain (checklist 6.1–6.7):
// pure preview math (docx §6 fixture 168h × $65 = $10,920), pay-rate
// fallback chain with the payRateMissing guard, approved-only idempotent
// create, W2/C2C/unknown type branch, pay/void lifecycle, list filters,
// and the payrolls index batch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { getDb } from '../lib/mongodb.js'

vi.mock('../lib/mongodb.js')
vi.mock('../services/activity.service.js', () => ({
  createActivity: vi.fn(),
}))

const ADMIN_ID = '507f1f77bcf86cd799439011'
const ADMIN_NAME = 'Ada Admin'

// ─── Minimal in-memory Mongo (matcher + updates) ─────────────────────────────
// Same proven harness as invoice-lines.test.ts, extended with `$unset` (the
// payroll refresh clears paid/void audit keys) and `createIndex` (6.1).

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
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => eq(x, b[i]))
  }
  return a === b
}

function match(doc: Doc, filter: Doc): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or') {
      if (!(cond as Doc[]).some((c) => match(doc, c))) return false
      continue
    }
    if (key === '$and') {
      if (!(cond as Doc[]).every((c) => match(doc, c))) return false
      continue
    }
    const value = doc[key]
    const isOperatorObject =
      cond !== null &&
      typeof cond === 'object' &&
      !(cond instanceof ObjectId) &&
      !(cond instanceof Date) &&
      !Array.isArray(cond)
    if (isOperatorObject) {
      for (const [op, arg] of Object.entries(cond as Doc)) {
        if (op === '$exists') {
          if ((value !== undefined) !== arg) return false
        } else if (op === '$in') {
          if (!(arg as unknown[]).some((x) => eq(value, x))) return false
        } else if (op === '$nin') {
          if ((arg as unknown[]).some((x) => eq(value, x))) return false
        } else if (op === '$ne') {
          if (eq(value, arg)) return false
        } else if (op === '$gte') {
          if (!(norm(value) >= norm(arg))) return false
        } else if (op === '$lte') {
          if (!(norm(value) <= norm(arg))) return false
        } else if (op === '$gt') {
          if (!(norm(value) > norm(arg))) return false
        } else if (op === '$lt') {
          if (!(norm(value) < norm(arg))) return false
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

function applyUpdate(doc: Doc, update: Doc): void {
  for (const [op, spec] of Object.entries(update)) {
    if (op === '$set') {
      Object.assign(doc, spec)
    } else if (op === '$unset') {
      for (const field of Object.keys(spec as Doc)) delete doc[field]
    } else if (op === '$push') {
      for (const [field, value] of Object.entries(spec as Doc)) {
        const pushValue =
          value !== null && typeof value === 'object' && '$each' in (value as Doc)
            ? (value as Doc).$each
            : [value]
        if (!Array.isArray(doc[field])) doc[field] = []
        doc[field].push(...pushValue)
      }
    } else if (op === '$inc') {
      for (const [field, value] of Object.entries(spec as Doc)) {
        doc[field] = (doc[field] ?? 0) + (value as number)
      }
    } else if (op === '$pull') {
      for (const [field, cond] of Object.entries(spec as Doc)) {
        doc[field] = (doc[field] ?? []).filter((element: Doc) => !match(element, cond))
      }
    }
  }
}

function makeDb(): {
  db: any
  raw: Map<string, Doc[]>
  createdIndexes: string[]
} {
  const stores = new Map<string, Doc[]>()
  const createdIndexes: string[] = []
  const get = (name: string): Doc[] => {
    if (!stores.has(name)) stores.set(name, [])
    return stores.get(name)!
  }
  const collection = (name: string) => {
    const store = get(name)
    const sorted = (docs: Doc[], spec?: Doc): Doc[] => {
      if (!spec) return [...docs]
      const entries = Object.entries(spec)
      return [...docs].sort((a, b) => {
        for (const [field, dir] of entries) {
          if (eq(a[field], b[field])) continue
          const cmp = norm(a[field]) < norm(b[field]) ? -1 : 1
          return (dir as number) < 0 ? -cmp : cmp
        }
        return 0
      })
    }
    return {
      find: vi.fn((filter: Doc = {}) => ({
        toArray: vi.fn(async () => store.filter((d) => match(d, filter))),
        sort: vi.fn((spec?: Doc) => ({
          toArray: vi.fn(async () => sorted(store.filter((d) => match(d, filter)), spec)),
        })),
      })),
      findOne: vi.fn(async (filter: Doc = {}) => store.find((d) => match(d, filter)) ?? null),
      insertOne: vi.fn(async (doc: Doc) => {
        const inserted = { _id: doc._id ?? new ObjectId(), ...doc }
        store.push(inserted)
        return { insertedId: inserted._id }
      }),
      updateOne: vi.fn(async (filter: Doc, update: Doc) => {
        const doc = store.find((d) => match(d, filter))
        if (doc) applyUpdate(doc, update)
        return { matchedCount: doc ? 1 : 0 }
      }),
      findOneAndUpdate: vi.fn(async (filter: Doc, update: Doc, opts?: Doc) => {
        let doc = store.find((d) => match(d, filter))
        if (!doc) {
          if (!opts?.upsert) return null
          doc = { _id: new ObjectId() }
          for (const [key, value] of Object.entries(filter)) {
            if (key.startsWith('$')) continue
            if (value !== null && typeof value === 'object' && !(value instanceof ObjectId)) continue
            doc[key] = value
          }
          store.push(doc)
        }
        applyUpdate(doc, update)
        return doc
      }),
      countDocuments: vi.fn(
        async (filter: Doc = {}) => store.filter((d) => match(d, filter)).length,
      ),
      createIndex: vi.fn(async (keys: Doc, opts?: Doc) => {
        createdIndexes.push(`${name}:${JSON.stringify(keys)}${opts?.unique ? ':unique' : ''}`)
        return 'idx'
      }),
    }
  }
  return {
    db: { collection: vi.fn((name: string) => collection(name)) },
    raw: stores,
    createdIndexes,
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function mockResource(opts: {
  name?: string
  resourceType?: 'w2' | 'c2c' | 'offshore'
  defaultPayRate?: number
} = {}): Doc {
  return {
    _id: new ObjectId(),
    name: opts.name ?? 'Ria Worker',
    email: `${(opts.name ?? 'ria').toLowerCase().replace(/\s+/g, '.')}@example.com`,
    employeeId: 'E000456',
    department: 'Engineering',
    role: 'user',
    isSupervisor: false,
    status: 'active',
    // Phase 2 enrichment — deliberately omitted when not supplied (legacy).
    ...(opts.resourceType !== undefined ? { resourceType: opts.resourceType } : {}),
    ...(opts.defaultPayRate !== undefined ? { defaultPayRate: opts.defaultPayRate } : {}),
  }
}

function mockAssignment(resource: Doc, opts: { payRate?: number } = {}): Doc {
  return {
    _id: new ObjectId(),
    resourceId: resource._id,
    projectId: new ObjectId(),
    billRate: 120,
    payRate: opts.payRate ?? 65,
    billingType: 'hourly',
    timesheetRequired: true,
    approvalRequired: true,
    status: 'active',
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * docx §6 fixture by default: 120 regular + 48 overtime = 168 total hours —
 * the only way to reach 168h in one week (Mon–Fri caps at 120h), which is why
 * payroll pays `totalHours` while invoicing bills regular Mon–Fri only.
 */
function mockTimesheet(
  resource: Doc,
  opts: {
    assignment?: Doc | null
    status?: string
    weekStart?: string
    regular?: number
    overtime?: number
  } = {},
): Doc {
  const regular = opts.regular ?? 120
  const overtime = opts.overtime ?? 48
  return {
    _id: new ObjectId(),
    userId: resource._id,
    projectId: new ObjectId(),
    weekStart: opts.weekStart ?? '2026-09-14',
    status: opts.status ?? 'approved',
    // Key stays ABSENT when there is no assignment (legacy-shaped timesheet).
    ...(opts.assignment ? { assignmentId: opts.assignment._id } : {}),
    entries: [],
    notes: '',
    regularHours: regular,
    overtimeHours: overtime,
    totalHours: regular + overtime,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('Phase 6 — payroll: preview, approved-only create, idempotency, W2/C2C', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  afterEach(() => {
    vi.mocked(getDb).mockReset()
  })

  function setup(opts: {
    resources: Doc[]
    assignments?: Doc[]
    timesheets: Doc[]
    payrolls?: Doc[]
  }) {
    const { db, raw, createdIndexes } = makeDb()
    raw.set(COLLECTIONS.USERS, opts.resources)
    raw.set(COLLECTIONS.ASSIGNMENTS, opts.assignments ?? [])
    raw.set(COLLECTIONS.TIMESHEETS, opts.timesheets)
    raw.set(COLLECTIONS.PAYROLLS, opts.payrolls ?? [])
    vi.mocked(getDb).mockResolvedValue(db as never)
    return { db, raw, createdIndexes }
  }

  it('6.1 ensures the payrolls index batch with a UNIQUE timesheetId', async () => {
    const { db, createdIndexes } = makeDb()
    vi.mocked(getDb).mockResolvedValue(db as never)
    const { ensurePayrollIndexes } = await import('../lib/collections.js')
    await ensurePayrollIndexes()
    expect(createdIndexes).toEqual([
      'payrolls:{"resourceId":1}',
      'payrolls:{"assignmentId":1}',
      'payrolls:{"timesheetId":1}:unique',
      'payrolls:{"status":1}',
    ])
    // ensureIndexes() itself still never touches payrolls — frozen by the
    // Phase 0 baseline test (flow-baseline.test.ts), not repeated here.
  })

  it('6.3 preview math: 168h × $65 = $10,920, and preview performs ZERO writes', async () => {
    const resource = mockResource({ name: 'Ria Worker', resourceType: 'w2' })
    const assignment = mockAssignment(resource, { payRate: 65 })
    const timesheet = mockTimesheet(resource, { assignment })
    const { db, raw } = setup({
      resources: [resource],
      assignments: [assignment],
      timesheets: [timesheet],
    })

    const { previewPayroll } = await import('../services/payroll.service.js')
    const preview = await previewPayroll(timesheet._id.toString())

    expect(preview.hours).toBe(168)
    expect(preview.regularHours).toBe(120)
    expect(preview.overtimeHours).toBe(48)
    expect(preview.payRate).toBe(65)
    expect(preview.payRateSource).toBe('assignment')
    expect(preview.grossPay).toBe(10920)
    expect(preview.payRateMissing).toBe(false)
    expect(preview.type).toBe('w2')
    expect(preview.periodStart).toBe('2026-09-14')
    expect(preview.periodEnd).toBe('2026-09-20')
    expect(preview.timesheetStatus).toBe('approved')

    // PURE: the payrolls collection was never even opened, nothing inserted.
    expect(db.collection).not.toHaveBeenCalledWith(COLLECTIONS.PAYROLLS)
    expect(raw.get(COLLECTIONS.PAYROLLS)).toEqual([])
  })

  it('rate chain: assignment → resource default → payRateMissing (never a silent $0)', async () => {
    // A) Backfilled assignment carries payRate 0 → falls back to user default.
    const resourceA = mockResource({ defaultPayRate: 50 })
    const assignmentA = mockAssignment(resourceA, { payRate: 0 })
    const timesheetA = mockTimesheet(resourceA, { assignment: assignmentA })
    setup({
      resources: [resourceA],
      assignments: [assignmentA],
      timesheets: [timesheetA],
    })
    const { previewPayroll } = await import('../services/payroll.service.js')
    const fallback = await previewPayroll(timesheetA._id.toString())
    expect(fallback.payRate).toBe(50)
    expect(fallback.payRateSource).toBe('user')
    expect(fallback.payRateMissing).toBe(false)
    expect(fallback.grossPay).toBe(8400)

    // B) Neither source has a rate → flagged, gross 0, pay will be blocked.
    const resourceB = mockResource()
    const timesheetB = mockTimesheet(resourceB) // no assignment at all
    setup({ resources: [resourceB], timesheets: [timesheetB] })
    const missing = await previewPayroll(timesheetB._id.toString())
    expect(missing.payRate).toBe(0)
    expect(missing.payRateSource).toBe('none')
    expect(missing.payRateMissing).toBe(true)
    expect(missing.grossPay).toBe(0)
  })

  it('6.4 approval gate: only approved timesheets can create payroll', async () => {
    const resource = mockResource()
    const assignment = mockAssignment(resource)
    for (const status of ['draft', 'pending', 'declined', 'withdrawn']) {
      const timesheet = mockTimesheet(resource, { assignment, status })
      const { raw } = setup({
        resources: [resource],
        assignments: [assignment],
        timesheets: [timesheet],
      })
      const { createPayrollFromTimesheet } = await import('../services/payroll.service.js')
      await expect(
        createPayrollFromTimesheet(timesheet._id.toString(), ADMIN_ID, ADMIN_NAME),
      ).rejects.toThrow('Only approved timesheets can be used to create payroll')
      expect(raw.get(COLLECTIONS.PAYROLLS)).toEqual([])
    }
  })

  it('6.4 idempotent create: one document per timesheet, snapshotting the money fields', async () => {
    const resource = mockResource({ name: 'Ria Worker', resourceType: 'w2' })
    const assignment = mockAssignment(resource, { payRate: 65 })
    const timesheet = mockTimesheet(resource, { assignment })
    const { raw } = setup({
      resources: [resource],
      assignments: [assignment],
      timesheets: [timesheet],
    })
    const { createPayrollFromTimesheet } = await import('../services/payroll.service.js')
    const id = timesheet._id.toString()

    const first = await createPayrollFromTimesheet(id, ADMIN_ID, ADMIN_NAME)
    const second = await createPayrollFromTimesheet(id, ADMIN_ID, ADMIN_NAME)

    expect(second.id).toBe(first.id)
    expect(raw.get(COLLECTIONS.PAYROLLS)).toHaveLength(1)

    expect(first.status).toBe('draft')
    expect(first.resourceId).toBe(resource._id.toString())
    expect(first.assignmentId).toBe(assignment._id.toString())
    expect(first.timesheetId).toBe(id)
    expect(first.hours).toBe(168)
    expect(first.payRate).toBe(65)
    expect(first.grossPay).toBe(10920)
    expect(first.payRateMissing).toBe(false)
    expect(first.type).toBe('w2')
    expect(first.periodStart).toBe('2026-09-14')
    expect(first.periodEnd).toBe('2026-09-20')
    expect(first.createdBy).toBe(ADMIN_ID)
    expect(first.createdByName).toBe(ADMIN_NAME)
  })

  it('W2 vs C2C branch: type comes from Phase 2 resourceType; legacy stays unknown', async () => {
    const w2 = mockResource({ name: 'Wanda W2', resourceType: 'w2' })
    const c2c = mockResource({ name: 'Carl C2C', resourceType: 'c2c' })
    const legacy = mockResource({ name: 'Lana Legacy' }) // no enrichment key
    const worlds = [w2, c2c, legacy].map((resource) => {
      const assignment = mockAssignment(resource, { payRate: 65 })
      return { resource, assignment, timesheet: mockTimesheet(resource, { assignment }) }
    })
    const { raw } = setup({
      resources: worlds.map((w) => w.resource),
      assignments: worlds.map((w) => w.assignment),
      timesheets: worlds.map((w) => w.timesheet),
    })
    const { createPayrollFromTimesheet } = await import('../services/payroll.service.js')

    const payrolls = []
    for (const world of worlds) {
      payrolls.push(
        await createPayrollFromTimesheet(world.timesheet._id.toString(), ADMIN_ID, ADMIN_NAME),
      )
    }
    expect(payrolls.map((p) => p.type)).toEqual(['w2', 'c2c', 'unknown'])
    expect(raw.get(COLLECTIONS.PAYROLLS)).toHaveLength(3)
    // Each branch still computes the same money from the same math.
    expect(payrolls.every((p) => p.grossPay === 10920)).toBe(true)
  })

  it('6.5 blocks pay while payRateMissing, then the fix → refresh → pay flow completes', async () => {
    const resource = mockResource({ name: 'Ria Worker', resourceType: 'w2' })
    const assignment = mockAssignment(resource, { payRate: 0 }) // backfilled: no rate
    const timesheet = mockTimesheet(resource, { assignment })
    const { raw } = setup({
      resources: [resource],
      assignments: [assignment],
      timesheets: [timesheet],
    })
    const { createPayrollFromTimesheet, markPayrollPaid } = await import(
      '../services/payroll.service.js'
    )
    const id = timesheet._id.toString()

    const draft = await createPayrollFromTimesheet(id, ADMIN_ID, ADMIN_NAME)
    expect(draft.payRateMissing).toBe(true)
    expect(draft.grossPay).toBe(0)

    // Risk log: pay is BLOCKED until the rate is fixed — no silent $0 math.
    await expect(markPayrollPaid(draft.id, ADMIN_ID)).rejects.toThrow(
      /missing pay rate/,
    )

    // Fix the assignment rate, then re-create: same doc, recomputed snapshot.
    const backfilled = raw.get(COLLECTIONS.ASSIGNMENTS)![0]!
    backfilled.payRate = 65
    const refreshed = await createPayrollFromTimesheet(id, ADMIN_ID, ADMIN_NAME)
    expect(refreshed.id).toBe(draft.id)
    expect(raw.get(COLLECTIONS.PAYROLLS)).toHaveLength(1)
    expect(refreshed.payRateMissing).toBe(false)
    expect(refreshed.payRate).toBe(65)
    expect(refreshed.grossPay).toBe(10920)
    expect(refreshed.status).toBe('draft')

    // Now pay succeeds and is terminal.
    const paid = await markPayrollPaid(draft.id, ADMIN_ID)
    expect(paid.status).toBe('paid')
    expect(paid.paidAt).toBeInstanceOf(Date)
    expect(paid.paidBy).toBe(ADMIN_ID)
    await expect(markPayrollPaid(draft.id, ADMIN_ID)).rejects.toThrow('Payroll is already paid')
    await expect(
      import('../services/payroll.service.js').then((m) => m.payrollVoid(draft.id, ADMIN_ID)),
    ).rejects.toThrow(/cannot be voided/)

    // Paid is immutable: a later create returns the paid record untouched.
    const after = await createPayrollFromTimesheet(id, ADMIN_ID, ADMIN_NAME)
    expect(after.status).toBe('paid')
    expect(after.grossPay).toBe(10920)
    expect(raw.get(COLLECTIONS.PAYROLLS)).toHaveLength(1)
  })

  it('6.5 void: draft → void only, and re-create revives the SAME document', async () => {
    const resource = mockResource()
    const assignment = mockAssignment(resource, { payRate: 65 })
    const timesheet = mockTimesheet(resource, { assignment })
    const { raw } = setup({
      resources: [resource],
      assignments: [assignment],
      timesheets: [timesheet],
    })
    const { createPayrollFromTimesheet, payrollVoid } = await import(
      '../services/payroll.service.js'
    )
    const id = timesheet._id.toString()

    const draft = await createPayrollFromTimesheet(id, ADMIN_ID, ADMIN_NAME)
    const voided = await payrollVoid(draft.id, ADMIN_ID, 'wrong assignment')
    expect(voided.status).toBe('void')
    expect(voided.voidReason).toBe('wrong assignment')
    expect(voided.voidedAt).toBeInstanceOf(Date)
    await expect(payrollVoid(draft.id, ADMIN_ID)).rejects.toThrow('Payroll is already voided')

    // Revive: re-create from the same timesheet — still ONE document, audit
    // keys cleared by $unset, back to draft.
    const revived = await createPayrollFromTimesheet(id, ADMIN_ID, ADMIN_NAME)
    expect(revived.id).toBe(draft.id)
    expect(revived.status).toBe('draft')
    expect(revived.voidReason).toBeUndefined()
    expect(revived.voidedAt).toBeUndefined()
    expect(raw.get(COLLECTIONS.PAYROLLS)).toHaveLength(1)
  })

  it('6.5 admin list filters by resource, status and period range', async () => {
    const resourceA = mockResource({ name: 'Alpha Worker' })
    const assignmentA = mockAssignment(resourceA, { payRate: 65 })
    const timesheetA = mockTimesheet(resourceA, { assignment: assignmentA, weekStart: '2026-09-14' })
    const resourceB = mockResource({ name: 'Beta Worker' })
    const assignmentB = mockAssignment(resourceB, { payRate: 40 })
    const timesheetB = mockTimesheet(resourceB, { assignment: assignmentB, weekStart: '2026-09-21' })
    setup({
      resources: [resourceA, resourceB],
      assignments: [assignmentA, assignmentB],
      timesheets: [timesheetA, timesheetB],
    })
    const { createPayrollFromTimesheet, payrollVoid, listPayrolls } = await import(
      '../services/payroll.service.js'
    )

    const payrollA = await createPayrollFromTimesheet(
      timesheetA._id.toString(), ADMIN_ID, ADMIN_NAME,
    )
    const payrollB = await createPayrollFromTimesheet(
      timesheetB._id.toString(), ADMIN_ID, ADMIN_NAME,
    )
    await payrollVoid(payrollB.id, ADMIN_ID, 'test void')

    const byResource = await listPayrolls({ resourceId: resourceA._id.toString() })
    expect(byResource.map((p) => p.id)).toEqual([payrollA.id])

    const drafts = await listPayrolls({ status: 'draft' })
    expect(drafts.map((p) => p.id)).toEqual([payrollA.id])

    const voids = await listPayrolls({ status: 'void' })
    expect(voids.map((p) => p.id)).toEqual([payrollB.id])

    const early = await listPayrolls({ from: '2026-09-01', to: '2026-09-20' })
    expect(early.map((p) => p.id)).toEqual([payrollA.id])

    const late = await listPayrolls({ from: '2026-09-21', to: '2026-09-30' })
    expect(late.map((p) => p.id)).toEqual([payrollB.id])

    const all = await listPayrolls()
    expect(all).toHaveLength(2)
  })

  it('6.5 mounted at /api/v1/payrolls behind authenticate (401 without a token)', async () => {
    const { createApp } = await import('../app.js')
    // @ts-ignore — supertest ships without types here; same pattern as auth.test.ts
    const { default: request } = await import('supertest')
    const res = await request(createApp()).get('/api/v1/payrolls')
    expect(res.status).toBe(401)
  })
})