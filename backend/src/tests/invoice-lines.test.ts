/// <reference types="vitest" />

// Flow Integration Phase 5 — invoice lines, approved-only cutover, double-bill
// guard, paid/void lifecycle, and the totals-preserving backfill (checklist 5.9).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { getDb } from '../lib/mongodb.js'

vi.mock('../lib/mongodb.js')
vi.mock('../services/activity.service.js', () => ({
  createActivity: vi.fn(),
}))

const ADMIN_ID = '507f1f77bcf86cd799439011'
const ORIGINAL_FLAG = process.env.FLOW_INTEGRATION_PHASE

// ─── Minimal in-memory Mongo (matcher + updates) ─────────────────────────────
// Supports exactly the operators the invoice flow uses: equality, $or/$and,
// $in/$nin/$ne/$exists/$gte/$lte, plus $set/$push/$inc/$pull upserts. ObjectId
// and Date compare by value; `{field: null}` matches missing, like Mongo.

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

function makeDb(): { db: any; raw: Map<string, Doc[]> } {
  const stores = new Map<string, Doc[]>()
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
    }
  }
  return { db: { collection: vi.fn((name: string) => collection(name)) }, raw: stores }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function mockProject(hourlyRate: number): Doc {
  return {
    _id: new ObjectId(),
    name: 'Phase Five',
    hourlyRate,
    status: 'active',
    managerId: new ObjectId(),
    teamMemberIds: [],
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function mockTimesheet(
  project: Doc,
  opts: {
    weekStart?: string
    status?: string
    assignmentId?: Doc | null
    hours?: { mon?: number; tue?: number; wed?: number; thu?: number; fri?: number }
    entryType?: string
  } = {},
): Doc {
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    projectId: project._id,
    weekStart: opts.weekStart ?? '2024-01-01',
    status: opts.status ?? 'approved',
    assignmentId: opts.assignmentId ?? null,
    entries: [{ entryType: opts.entryType ?? 'regular', hours: opts.hours ?? { mon: 8 } }],
    notes: '',
    regularHours: 8,
    overtimeHours: 0,
    totalHours: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function seedInvoice(project: Doc, overrides: Doc = {}): Doc {
  const now = new Date()
  return {
    _id: new ObjectId(),
    invoiceNumber: 'INV-2024-0001',
    projectId: project._id,
    projectName: project.name,
    weekStart: '2024-01-01',
    weekEnd: '2024-01-05',
    periodLabel: 'Jan 1 – Jan 5, 2024',
    hourlyRate: project.hourlyRate,
    billableHours: 8,
    fixedCost: 8 * project.hourlyRate,
    variableCosts: [],
    variableCostTotal: 0,
    total: 8 * project.hourlyRate,
    status: 'sent',
    createdBy: new ObjectId(),
    createdByName: 'Admin User',
    createdAt: now,
    updatedAt: now,
    sentAt: now,
    ...overrides,
  }
}

describe('Phase 5 — invoice traceability (lines, approved-only, paid/void)', () => {
  let project: Doc

  beforeEach(() => {
    vi.mocked(getDb).mockReset()
    delete process.env.FLOW_INTEGRATION_PHASE // default: legacy phase
    project = mockProject(50)
  })

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.FLOW_INTEGRATION_PHASE
    else process.env.FLOW_INTEGRATION_PHASE = ORIGINAL_FLAG
  })

  function setup(timesheets: Doc[], invoices: Doc[] = [], assignments: Doc[] = []) {
    const { db, raw } = makeDb()
    raw.set(COLLECTIONS.PROJECTS, [project])
    raw.set(COLLECTIONS.TIMESHEETS, timesheets)
    raw.set(COLLECTIONS.INVOICES, invoices)
    raw.set(COLLECTIONS.ASSIGNMENTS, assignments)
    vi.mocked(getDb).mockResolvedValue(db as never)
    return { db, raw }
  }

  describe('5.3/5.4 approved-only path builds per-timesheet lines', () => {
    it('bills only approved, unbilled timesheets and traces every dollar to a timesheet id', async () => {
      const assignment = { _id: new ObjectId(), billRate: 75, status: 'active' }
      const approvedA = mockTimesheet(project, {
        status: 'approved',
        assignmentId: assignment._id,
        hours: { mon: 8 },
      })
      const approvedB = mockTimesheet(project, {
        status: 'approved',
        hours: { tue: 4 },
      })
      const pending = mockTimesheet(project, { status: 'pending', hours: { wed: 8 } })
      const draft = mockTimesheet(project, { status: 'draft', hours: { thu: 8 } })
      const declined = mockTimesheet(project, { status: 'declined', hours: { fri: 8 } })
      setup([approvedA, approvedB, pending, draft, declined], [], [assignment])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        approvedOnly: true,
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      // Only the two approved timesheets are billed: 8h @75 (assignment rate)
      // + 4h @50 (invoice rate fallback) = 600 + 200.
      expect(invoice.lines).toHaveLength(2)
      expect(invoice.approvedOnly).toBe(true)
      expect(invoice.billableHours).toBe(12)
      expect(invoice.fixedCost).toBe(800)
      expect(invoice.total).toBe(800)

      // sum(lines) === fixedCost, each amount = round2(hours × rate).
      const lineSum = invoice.lines!.reduce((s, l) => s + l.amount, 0)
      expect(Math.round(lineSum * 100) / 100).toBe(invoice.fixedCost)

      const lineA = invoice.lines!.find((l) => l.timesheetId === approvedA._id.toString())!
      const lineB = invoice.lines!.find((l) => l.timesheetId === approvedB._id.toString())!
      expect(lineA).toMatchObject({ hours: 8, rate: 75, amount: 600, rateSource: 'assignment' })
      expect(lineB).toMatchObject({ hours: 4, rate: 50, amount: 200, rateSource: 'invoice' })

      // Reservation: exactly the billed timesheets are recorded.
      expect(invoice.billedTimesheetIds!.sort()).toEqual(
        [approvedA._id.toString(), approvedB._id.toString()].sort(),
      )
      for (const ts of [pending, draft, declined]) {
        expect(invoice.billedTimesheetIds).not.toContain(ts._id.toString())
      }
    })

    it('treats a backfilled billRate of 0 as unset — never a silent $0 line', async () => {
      const backfilled = { _id: new ObjectId(), billRate: 0, status: 'active' }
      const ts = mockTimesheet(project, {
        status: 'approved',
        assignmentId: backfilled._id,
        hours: { mon: 8 },
      })
      setup([ts], [], [backfilled])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        approvedOnly: true,
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.lines![0].rate).toBe(50)
      expect(invoice.lines![0].rateSource).toBe('invoice')
      expect(invoice.fixedCost).toBe(400)
    })

    it('throws when no approved unbilled hours exist', async () => {
      const pending = mockTimesheet(project, { status: 'pending' })
      setup([pending])

      const { createInvoice } = await import('../services/invoice.service.js')
      await expect(
        createInvoice({
          projectId: project._id.toString(),
          approvedOnly: true,
          adminUserId: ADMIN_ID,
          adminUserName: 'Admin User',
        }),
      ).rejects.toThrow('No approved unbilled hours')
    })

    it('keeps the one-open-draft-per-project guard on the approved path', async () => {
      const ts = mockTimesheet(project, { status: 'approved' })
      setup([ts])

      const { createInvoice } = await import('../services/invoice.service.js')
      const args = {
        projectId: project._id.toString(),
        approvedOnly: true,
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      }
      await createInvoice(args)
      await expect(createInvoice(args)).rejects.toThrow('open draft invoice already exists')
    })
  })

  describe('5.4 flag branch (legacy default vs approved-only, reversible)', () => {
    it('flag off + no input ⇒ legacy path: sums every status, stores no lineage keys', async () => {
      const approved = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const pending = mockTimesheet(project, { status: 'pending', hours: { tue: 8 } })
      const { raw } = setup([approved, pending])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      // Legacy math: BOTH timesheets bill (pending included) — 16h × 50.
      expect(invoice.billableHours).toBe(16)
      expect(invoice.fixedCost).toBe(800)
      // API shape is additive-stable: empty/false lineage keys.
      expect(invoice.lines).toEqual([])
      expect(invoice.billedTimesheetIds).toEqual([])
      expect(invoice.approvedOnly).toBe(false)
      // Stored doc keeps the exact pre-Phase-5 shape (no lineage keys at all).
      const stored = raw.get(COLLECTIONS.INVOICES)![0]!
      expect(stored.lines).toBeUndefined()
      expect(stored.billedTimesheetIds).toBeUndefined()
      expect(stored.approvedOnly).toBeUndefined()
    })

    it('flag on (FLOW_INTEGRATION_PHASE=invoices) ⇒ approved-only is the default', async () => {
      process.env.FLOW_INTEGRATION_PHASE = 'invoices'
      const approved = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const pending = mockTimesheet(project, { status: 'pending', hours: { tue: 8 } })
      setup([approved, pending])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.approvedOnly).toBe(true)
      expect(invoice.billableHours).toBe(8) // pending excluded
      expect(invoice.fixedCost).toBe(400)
      expect(invoice.billedTimesheetIds).toEqual([approved._id.toString()])
    })

    it('explicit approvedOnly:false reverts the cutover without a code change', async () => {
      process.env.FLOW_INTEGRATION_PHASE = 'invoices' // cutover ON
      const approved = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const pending = mockTimesheet(project, { status: 'pending', hours: { tue: 8 } })
      setup([approved, pending])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        approvedOnly: false, // forced revert
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.fixedCost).toBe(800) // legacy sum-all again
      expect(invoice.lines).toEqual([])
    })

    it('explicit approvedOnly:true works even before the cutover', async () => {
      delete process.env.FLOW_INTEGRATION_PHASE // cutover OFF
      const approved = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const pending = mockTimesheet(project, { status: 'pending', hours: { tue: 8 } })
      setup([approved, pending])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        approvedOnly: true,
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.fixedCost).toBe(400)
      expect(invoice.lines).toHaveLength(1)
    })
  })

  describe('5.3 double-bill guard and void release', () => {
    it('never bills a timesheet already reserved by another non-void invoice', async () => {
      const reserved = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const fresh = mockTimesheet(project, { status: 'approved', hours: { tue: 4 } })
      const existing = seedInvoice(project, {
        status: 'sent',
        billedTimesheetIds: [reserved._id.toString()],
        lines: [],
        approvedOnly: true,
      })
      setup([reserved, fresh], [existing])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        approvedOnly: true,
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.billedTimesheetIds).toEqual([fresh._id.toString()])
      expect(invoice.fixedCost).toBe(200) // only the fresh 4h
    })

    it('throws instead of double-billing when everything is already reserved', async () => {
      const reserved = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const existing = seedInvoice(project, {
        status: 'sent',
        billedTimesheetIds: [reserved._id.toString()],
        lines: [],
        approvedOnly: true,
      })
      setup([reserved], [existing])

      const { createInvoice } = await import('../services/invoice.service.js')
      await expect(
        createInvoice({
          projectId: project._id.toString(),
          approvedOnly: true,
          adminUserId: ADMIN_ID,
          adminUserName: 'Admin User',
        }),
      ).rejects.toThrow('No approved unbilled hours')
    })

    it('void releases the reservation — its timesheets become billable again', async () => {
      const ts = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const voided = seedInvoice(project, {
        status: 'void',
        billedTimesheetIds: [ts._id.toString()],
        lines: [],
        approvedOnly: true,
        voidedAt: new Date(),
        voidReason: 'wrong client',
      })
      setup([ts], [voided])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        approvedOnly: true,
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.billedTimesheetIds).toEqual([ts._id.toString()])
      expect(invoice.fixedCost).toBe(400)
    })

    it('paid keeps the reservation — a paid invoice can never be re-billed', async () => {
      const ts = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const paid = seedInvoice(project, {
        status: 'paid',
        billedTimesheetIds: [ts._id.toString()],
        lines: [],
        approvedOnly: true,
        paidAt: new Date(),
      })
      setup([ts], [paid])

      const { createInvoice } = await import('../services/invoice.service.js')
      await expect(
        createInvoice({
          projectId: project._id.toString(),
          approvedOnly: true,
          adminUserId: ADMIN_ID,
          adminUserName: 'Admin User',
        }),
      ).rejects.toThrow('No approved unbilled hours')
    })
  })

  describe('5.5/5.6 paid & void lifecycle', () => {
    it('only sent invoices can be marked paid; paid is terminal', async () => {
      const draft = seedInvoice(project, { status: 'draft', sentAt: undefined })
      setup([], [draft])

      const { markInvoicePaid } = await import('../services/invoice.service.js')
      await expect(markInvoicePaid(draft._id.toString(), ADMIN_ID)).rejects.toThrow(
        'Only sent invoices can be marked paid',
      )
    })

    it('markInvoicePaid sets paid/paidAt and blocks every further transition', async () => {
      const sent = seedInvoice(project, { status: 'sent' })
      setup([], [sent])

      const svc = await import('../services/invoice.service.js')
      const paid = await svc.markInvoicePaid(sent._id.toString(), ADMIN_ID)
      expect(paid.status).toBe('paid')
      expect(paid.paidAt).toBeInstanceOf(Date)

      // Terminal: no second payment, no void, no send, no edits.
      await expect(svc.markInvoicePaid(sent._id.toString(), ADMIN_ID)).rejects.toThrow(
        'Invoice is already paid',
      )
      await expect(svc.invoiceVoid(sent._id.toString(), ADMIN_ID)).rejects.toThrow(
        'A paid invoice cannot be voided',
      )
      await expect(svc.sendInvoice(sent._id.toString(), ADMIN_ID)).rejects.toThrow(
        'Cannot send a paid invoice',
      )
      await expect(svc.updateInvoiceRate(sent._id.toString(), 99, ADMIN_ID)).rejects.toThrow(
        'Cannot modify a paid invoice',
      )
      await expect(
        svc.addVariableCosts(sent._id.toString(), [{ amount: 10, reason: 'late' }], ADMIN_ID),
      ).rejects.toThrow('Cannot modify a paid invoice')
    })

    it('void works from draft and sent, records reason, and is not twice-allowed', async () => {
      const draft = seedInvoice(project, { status: 'draft', sentAt: undefined })
      setup([], [draft])

      const svc = await import('../services/invoice.service.js')
      const voided = await svc.invoiceVoid(draft._id.toString(), ADMIN_ID, 'duplicate billing')
      expect(voided.status).toBe('void')
      expect(voided.voidedAt).toBeInstanceOf(Date)
      expect(voided.voidReason).toBe('duplicate billing')

      await expect(svc.invoiceVoid(draft._id.toString(), ADMIN_ID)).rejects.toThrow(
        'Invoice is already voided',
      )
      // A voided invoice can't be sent or edited either.
      await expect(svc.sendInvoice(draft._id.toString(), ADMIN_ID)).rejects.toThrow(
        'Cannot send a voided invoice',
      )
      await expect(svc.updateInvoiceRate(draft._id.toString(), 99, ADMIN_ID)).rejects.toThrow(
        'Cannot modify a voided invoice',
      )
    })

    it('void works from sent status too', async () => {
      const sent = seedInvoice(project, { status: 'sent' })
      setup([], [sent])

      const svc = await import('../services/invoice.service.js')
      const voided = await svc.invoiceVoid(sent._id.toString(), ADMIN_ID)
      expect(voided.status).toBe('void')
      expect(voided.voidReason).toBeNull()
    })

    it('list filter returns paid and void invoices (5.6)', async () => {
      const sent = seedInvoice(project, { status: 'sent', invoiceNumber: 'INV-2024-0001' })
      const paid = seedInvoice(project, { status: 'paid', invoiceNumber: 'INV-2024-0002' })
      const voided = seedInvoice(project, { status: 'void', invoiceNumber: 'INV-2024-0003' })
      setup([], [sent, paid, voided])

      const { listProjectInvoices } = await import('../services/invoice.service.js')
      const projectId = project._id.toString()

      const paidList = await listProjectInvoices(projectId, { status: 'paid' })
      expect(paidList.map((i) => i.invoiceNumber)).toEqual(['INV-2024-0002'])

      const voidList = await listProjectInvoices(projectId, { status: 'void' })
      expect(voidList.map((i) => i.invoiceNumber)).toEqual(['INV-2024-0003'])

      const all = await listProjectInvoices(projectId)
      expect(all).toHaveLength(3)
    })
  })

  describe('assignment/timesheet scoping', () => {
    it('assignmentId scope bills only that assignment’s timesheets', async () => {
      const assignmentA = { _id: new ObjectId(), billRate: 60, status: 'active' }
      const assignmentB = { _id: new ObjectId(), billRate: 70, status: 'active' }
      const tsA = mockTimesheet(project, {
        status: 'approved',
        assignmentId: assignmentA._id,
        hours: { mon: 8 },
      })
      const tsB = mockTimesheet(project, {
        status: 'approved',
        assignmentId: assignmentB._id,
        hours: { tue: 8 },
      })
      setup([tsA, tsB], [], [assignmentA, assignmentB])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        approvedOnly: true,
        assignmentId: assignmentA._id.toString(),
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.billedTimesheetIds).toEqual([tsA._id.toString()])
      expect(invoice.lines![0].rate).toBe(60)
      expect(invoice.fixedCost).toBe(480)
      expect(invoice.assignmentId).toBe(assignmentA._id.toString())
    })

    it('timesheetIds scope bills only the listed timesheets (invalid id rejected)', async () => {
      const tsA = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      const tsB = mockTimesheet(project, { status: 'approved', hours: { tue: 8 } })
      setup([tsA, tsB])

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId: project._id.toString(),
        approvedOnly: true,
        timesheetIds: [tsA._id.toString()],
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })
      expect(invoice.billedTimesheetIds).toEqual([tsA._id.toString()])
    })

    it('rejects an invalid timesheet id in the billing scope', async () => {
      const tsA = mockTimesheet(project, { status: 'approved', hours: { mon: 8 } })
      setup([tsA])

      const { createInvoice } = await import('../services/invoice.service.js')
      await expect(
        createInvoice({
          projectId: project._id.toString(),
          approvedOnly: true,
          timesheetIds: ['not-an-id'],
          adminUserId: ADMIN_ID,
          adminUserName: 'Admin User',
        }),
      ).rejects.toThrow('Invalid timesheet id')
    })
  })

  describe('5.8 backfill: totals-preserving and idempotent', () => {
    it('reconstructs proportional lines with Σ == fixedCost exactly (diff 0)', async () => {
      // fixedCost 100 across 3 timesheets of 1h/1h/1h → 33.33/33.33/33.33 sums
      // to 99.99 → remainder 0.01 lands on the largest line ⇒ exactly 100.
      const legacy = seedInvoice(project, {
        status: 'sent',
        hourlyRate: 100,
        fixedCost: 100,
        total: 100,
        billableHours: 3,
      })
      delete (legacy as Doc).lines // pre-Phase-5 shape
      const ts1 = mockTimesheet(project, { status: 'submitted', hours: { mon: 1 } })
      const ts2 = mockTimesheet(project, { status: 'submitted', hours: { tue: 1 } })
      const ts3 = mockTimesheet(project, { status: 'approved', hours: { wed: 1 } })
      setup([ts1, ts2, ts3], [legacy])

      const { backfillInvoiceLines } = await import('../scripts/backfill-invoice-lines.js')
      const first = await backfillInvoiceLines({ dryRun: false })
      expect(first.errors).toEqual([])
      expect(first.updated).toBe(1)
      expect(first.maxTotalsDiff).toBe(0)

      const { getInvoice } = await import('../services/invoice.service.js')
      const invoice = await getInvoice(legacy._id.toString())
      expect(invoice!.lines).toHaveLength(3)
      const lineSum = invoice!.lines!.reduce((s, l) => s + l.amount, 0)
      expect(Math.round(lineSum * 100) / 100).toBe(100) // totals-preserving: diff 0
      expect(invoice!.fixedCost).toBe(100) // money untouched
      expect(invoice!.billedTimesheetIds).toHaveLength(3)
      expect(new Set(invoice!.lines!.map((l) => l.source))).toEqual(new Set(['proportional']))
      // Every line traces to a real timesheet id.
      const knownIds = new Set([ts1, ts2, ts3].map((t) => t._id.toString()))
      for (const line of invoice!.lines!) expect(knownIds.has(line.timesheetId)).toBe(true)

      // Idempotent: second run finds nothing to update.
      const second = await backfillInvoiceLines({ dryRun: false })
      expect(second.pending).toBe(0)
      expect(second.updated).toBe(0)
      expect(second.maxTotalsDiff).toBe(0)
    })

    it('leaves zero-hours and zero-cost invoices untouched', async () => {
      const empty = seedInvoice(project, {
        status: 'sent',
        fixedCost: 0,
        total: 0,
        billableHours: 0,
      })
      delete (empty as Doc).lines
      const overtimeOnly = mockTimesheet(project, {
        status: 'approved',
        entryType: 'overtime',
        hours: { mon: 8 },
      })
      setup([overtimeOnly], [empty])

      const { backfillInvoiceLines } = await import('../scripts/backfill-invoice-lines.js')
      const result = await backfillInvoiceLines({ dryRun: false })
      expect(result.updated).toBe(0)
      expect(result.skippedNoHours).toBe(1)

      const { getInvoice } = await import('../services/invoice.service.js')
      const invoice = await getInvoice(empty._id.toString())
      expect(invoice!.lines).toEqual([]) // nothing fabricated
      expect(invoice!.billedTimesheetIds).toEqual([])
    })
  })
})
