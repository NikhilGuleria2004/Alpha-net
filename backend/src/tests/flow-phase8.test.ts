import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'
// @ts-ignore
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { put } from '@vercel/blob'
import { COLLECTIONS } from '../lib/collections.js'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')
vi.mock('@vercel/blob')
vi.mock('../services/activity.service.js', () => ({ createActivity: vi.fn() }))

import { rolloverCompletedAssignments } from '../services/assignment.service.js'
import { createProject, updateProject } from '../services/project.service.js'
import { TIMESHEET_STATUS_FLOW } from '../services/timesheet.service.js'

// Flow Integration Phase 8 tests (flowIntegration.md §5):
//  1. Documents: optional userId/kind onboarding metadata + GET /documents filters
//  2. PO/SOW: GET /projects/:id computed poCap/poConsumed/poRemaining (never stored)
//  3. Assignment lifecycle: POST /assignments/cron/rollover (CRON_SECRET, manual-first)
//  4. Status mapping documented without renaming enums; isLocked exposed in responses

// ── Generic Mongo-shaped mock covering the query shapes used under test ──────
function eq(a: unknown, b: unknown): boolean {
  if (a instanceof ObjectId || b instanceof ObjectId) return String(a) === String(b)
  return a === b
}

function match(filter: Record<string, any> | undefined, doc: Record<string, any>): boolean {
  for (const [key, cond] of Object.entries(filter ?? {})) {
    const value = doc?.[key]
    if (cond !== null && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof Date)) {
      if ('$in' in cond) {
        const wanted = (cond.$in as unknown[]).map(String)
        const actual = Array.isArray(value) ? value.map(String) : [String(value)]
        if (!actual.some((v) => wanted.includes(v))) return false
      } else if ('$lt' in cond) {
        if (!(String(value) < String(cond.$lt))) return false
      } else {
        return false
      }
    } else if (Array.isArray(value)) {
      if (!value.some((v) => eq(v, cond))) return false
    } else if (!eq(value, cond)) {
      return false
    }
  }
  return true
}

function applySet(doc: Record<string, any>, update: Record<string, any>) {
  if (update.$set) Object.assign(doc, update.$set)
}

function createCollection(seed: Record<string, unknown>[] = []) {
  const store = [...seed]
  return {
    store,
    find: vi.fn((filter: Record<string, any> = {}) => {
      const out = store.filter((d) => match(filter, d))
      const chain: any = {
        sort: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        toArray: vi.fn(() => Promise.resolve([...out])),
      }
      return chain
    }),
    findOne: vi.fn((filter: Record<string, any> = {}) =>
      Promise.resolve(store.find((d) => match(filter, d)) ?? null),
    ),
    insertOne: vi.fn(async (doc: Record<string, any>) => {
      const _id = (doc._id as ObjectId) ?? new ObjectId()
      store.push({ _id, ...doc })
      return { insertedId: _id, acknowledged: true }
    }),
    findOneAndUpdate: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      const found = store.find((d) => match(filter, d))
      if (!found) return null
      applySet(found, update)
      return { ...found }
    }),
    updateOne: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      const found = store.find((d) => match(filter, d))
      if (found) applySet(found, update)
      return { matchedCount: found ? 1 : 0, modifiedCount: found ? 1 : 0 }
    }),
    updateMany: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      let matched = 0
      for (const d of store) {
        if (match(filter, d)) {
          applySet(d, update)
          matched++
        }
      }
      return { matchedCount: matched, modifiedCount: matched, acknowledged: true }
    }),
    deleteOne: vi.fn(async (filter: Record<string, any> = {}) => {
      const i = store.findIndex((d) => match(filter, d))
      if (i >= 0) {
        store.splice(i, 1)
        return { deletedCount: 1 }
      }
      return { deletedCount: 0 }
    }),
    countDocuments: vi.fn(async (filter: Record<string, any> = {}) => store.filter((d) => match(filter, d)).length),
  }
}

type MockCollection = ReturnType<typeof createCollection>
let cols: Record<string, MockCollection>

function setupDb(seed: Record<string, Record<string, unknown>[]> = {}) {
  const known: Record<string, MockCollection> = {}
  const get = (name: string) => (known[name] ??= createCollection(seed[name] ?? []))
  // Eager-create the collections tests seed BEFORE any request runs.
  for (const name of [
    COLLECTIONS.USERS,
    COLLECTIONS.PROJECTS,
    COLLECTIONS.DOCUMENTS,
    COLLECTIONS.INVOICES,
    COLLECTIONS.ASSIGNMENTS,
    COLLECTIONS.TIMESHEETS,
    COLLECTIONS.ACTIVITIES,
  ]) {
    get(name)
  }
  const db = { collection: vi.fn((name: string) => get(name)) }
  vi.mocked(getDb).mockReset()
  vi.mocked(getDb).mockResolvedValue(db as never)
  cols = known
}

function mockAuth(userId: string, role: string, isSupervisor = false) {
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role, isSupervisor, exp: 9999999999 } as never)
  cols[COLLECTIONS.USERS].store.push({
    _id: new ObjectId(userId),
    email: `${userId}@example.com`,
    name: 'Phase Eight',
    employeeId: 'E-P8',
    department: 'Eng',
    role,
    isSupervisor,
    status: 'active',
  })
}

function seedProjectDoc(overrides: Record<string, unknown> = {}): string {
  const _id = new ObjectId()
  cols[COLLECTIONS.PROJECTS].store.push({
    _id,
    name: 'Phase 8 project',
    sowNumber: 'SOW-P8',
    client: 'Client',
    description: 'd',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    deadline: '2025-12-01',
    status: 'active',
    managerId: new ObjectId(),
    supervisorId: new ObjectId(),
    teamMemberIds: [],
    hourlyRate: 100,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  })
  return _id.toString()
}

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET

beforeEach(() => {
  setupDb()
  process.env.CRON_SECRET = 'test-cron-secret-do-not-use-in-production'
  vi.mocked(put).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. Documents — optional userId/kind + GET /documents filters (§5 item 1)
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — onboarding document metadata (userId, kind)', () => {
  it('stores and returns kind + userId when supplied on upload (multipart)', async () => {
    const adminId = new ObjectId().toString()
    const subjectId = new ObjectId().toString()
    setupDb()
    const projectId = seedProjectDoc()
    mockAuth(adminId, 'admin')
    vi.mocked(put).mockResolvedValue({
      url: 'https://blob.example/documents/p8.pdf',
      pathname: 'documents/p8.pdf',
      contentType: 'application/pdf',
    } as never)

    const res = await request(createApp())
      .post(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', 'Bearer admin-token')
      .field('kind', 'i9')
      .field('userId', subjectId)
      .attach('file', Buffer.from('%PDF-1.4 phase8'), 'onboarding-i9.pdf')

    expect(res.status).toBe(201)
    expect(res.body.document.kind).toBe('i9')
    expect(res.body.document.userId).toBe(subjectId)
    expect(res.body.document.projectId).toBe(projectId)

    const stored = cols[COLLECTIONS.DOCUMENTS].store[0] as Record<string, any>
    expect(String(stored.userId)).toBe(subjectId) // persisted as ObjectId
    expect(stored.kind).toBe('i9')
    expect(String(stored.projectId)).toBe(projectId) // projectId retained for project docs
  })

  it('legacy upload without metadata stores NO kind/userId keys (unchanged shape)', async () => {
    const adminId = new ObjectId().toString()
    setupDb()
    const projectId = seedProjectDoc()
    mockAuth(adminId, 'admin')
    vi.mocked(put).mockResolvedValue({
      url: 'https://blob.example/documents/legacy.pdf',
      pathname: 'documents/legacy.pdf',
      contentType: 'application/pdf',
    } as never)

    const res = await request(createApp())
      .post(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', 'Bearer admin-token')
      .attach('file', Buffer.from('%PDF-1.4 legacy'), 'legacy.pdf')

    expect(res.status).toBe(201)
    expect(res.body.document).not.toHaveProperty('kind')
    expect(res.body.document).not.toHaveProperty('userId')
    const stored = cols[COLLECTIONS.DOCUMENTS].store[0] as Record<string, any>
    expect(stored).not.toHaveProperty('kind')
    expect(stored).not.toHaveProperty('userId')
  })

  it('rejects an invalid kind with 400 before writing any blob', async () => {
    const adminId = new ObjectId().toString()
    setupDb()
    const projectId = seedProjectDoc()
    mockAuth(adminId, 'admin')

    const res = await request(createApp())
      .post(`/api/v1/projects/${projectId}/documents`)
      .set('Authorization', 'Bearer admin-token')
      .field('kind', 'passport')
      .attach('file', Buffer.from('%PDF-1.4'), 'x.pdf')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(vi.mocked(put)).not.toHaveBeenCalled()
    expect(cols[COLLECTIONS.DOCUMENTS].store).toHaveLength(0)
  })
})

describe('Phase 8 — GET /documents?userId=&kind= filters (checklist listing)', () => {
  function seedDocs() {
    const adminId = new ObjectId().toString()
    const u1 = new ObjectId().toString()
    const u2 = new ObjectId().toString()
    const p1 = new ObjectId().toString()
    const p2 = new ObjectId().toString()
    const mk = (name: string, projectId: string, extra: Record<string, unknown>) => ({
      _id: new ObjectId(),
      projectId: new ObjectId(projectId),
      name,
      size: 10,
      mimeType: 'application/pdf',
      storageKey: `k/${name}`,
      url: `https://blob.example/k/${name}`,
      uploadedBy: new ObjectId(adminId),
      createdAt: new Date('2025-03-01'),
      ...extra,
    })
    setupDb({
      [COLLECTIONS.DOCUMENTS]: [
        mk('i9-u1.pdf', p1, { userId: new ObjectId(u1), kind: 'i9' }),
        mk('w4-u1.pdf', p1, { userId: new ObjectId(u1), kind: 'w4' }),
        mk('offer-u2.pdf', p2, { userId: new ObjectId(u2), kind: 'offer' }),
        mk('legacy.pdf', p2, {}), // untagged legacy doc
      ],
    })
    mockAuth(adminId, 'admin')
    return { adminId, u1, u2, p1, p2 }
  }

  it('admin: ?userId= narrows to that subject (untagged/other docs excluded)', async () => {
    const { u1 } = seedDocs()
    const res = await request(createApp())
      .get(`/api/v1/documents?userId=${u1}`)
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.documents.map((d: any) => d.name).sort()).toEqual(['i9-u1.pdf', 'w4-u1.pdf'])
    expect(res.body.documents.every((d: any) => d.userId === u1)).toBe(true)
  })

  it('admin: userId + kind combine (intersection), kind alone works too', async () => {
    const { u1 } = seedDocs()
    const both = await request(createApp())
      .get(`/api/v1/documents?userId=${u1}&kind=w4`)
      .set('Authorization', 'Bearer t')
    expect(both.status).toBe(200)
    expect(both.body.documents.map((d: any) => d.name)).toEqual(['w4-u1.pdf'])

    const kindOnly = await request(createApp())
      .get('/api/v1/documents?kind=offer')
      .set('Authorization', 'Bearer t')
    expect(kindOnly.status).toBe(200)
    expect(kindOnly.body.documents.map((d: any) => d.name)).toEqual(['offer-u2.pdf'])
  })

  it('admin: no filters returns everything (legacy behaviour preserved)', async () => {
    seedDocs()
    const res = await request(createApp()).get('/api/v1/documents').set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.documents).toHaveLength(4)
  })

  it('invalid kind/userId filter input → 400 (validated before the fetch)', async () => {
    seedDocs()
    const bad = await request(createApp())
      .get('/api/v1/documents?kind=passport')
      .set('Authorization', 'Bearer t')
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('VALIDATION_ERROR')

    const badId = await request(createApp())
      .get('/api/v1/documents?userId=not-an-objectid')
      .set('Authorization', 'Bearer t')
    expect(badId.status).toBe(400)
    expect(badId.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('non-admin: ?userId= INTERSECTS with project visibility (cannot reach other projects)', async () => {
    const memberId = new ObjectId().toString()
    const subjectId = new ObjectId().toString()
    setupDb()
    const inProject = seedProjectDoc({ teamMemberIds: [memberId] })
    const outProject = seedProjectDoc({ teamMemberIds: [new ObjectId().toString()] })
    const mk = (name: string, projectId: string, userId: string) => ({
      _id: new ObjectId(),
      projectId: new ObjectId(projectId),
      name,
      size: 10,
      mimeType: 'application/pdf',
      storageKey: `k/${name}`,
      url: `https://blob.example/k/${name}`,
      uploadedBy: new ObjectId(),
      createdAt: new Date('2025-03-01'),
      userId: new ObjectId(userId),
      kind: 'i9',
    })
    cols[COLLECTIONS.DOCUMENTS].store.push(
      mk('mine.pdf', inProject, subjectId),
      mk('theirs.pdf', outProject, subjectId), // same subject, NO project access
    )
    mockAuth(memberId, 'user')

    const res = await request(createApp())
      .get(`/api/v1/documents?userId=${subjectId}`)
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.documents.map((d: any) => d.name)).toEqual(['mine.pdf'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. PO/SOW — computed poCap/poConsumed/poRemaining on GET /projects/:id
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — PO/SOW balance (§5 item 2)', () => {
  function seedInvoice(projectId: string, status: string, total: number) {
    cols[COLLECTIONS.INVOICES].store.push({
      _id: new ObjectId(),
      projectId: new ObjectId(projectId),
      status,
      total,
      invoiceNumber: `INV-${cols[COLLECTIONS.INVOICES].store.length + 1}`,
      weekStart: '2025-03-03',
      weekEnd: '2025-03-09',
      periodLabel: 'Mar 3–9',
      hourlyRate: 100,
      fixedCost: 0,
      variableCosts: [],
      variableCostTotal: 0,
      createdBy: new ObjectId(),
      createdByName: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  it('poConsumed sums ONLY sent+paid invoices; drafts/voids/other projects excluded', async () => {
    const adminId = new ObjectId().toString()
    setupDb()
    const pid = seedProjectDoc({ poCap: 1000 })
    const otherPid = seedProjectDoc({ poCap: 9999 })
    mockAuth(adminId, 'admin')
    seedInvoice(pid, 'sent', 300)
    seedInvoice(pid, 'paid', 200)
    seedInvoice(pid, 'draft', 500) // not yet committed → excluded
    seedInvoice(pid, 'void', 100) // cancelled → excluded
    seedInvoice(otherPid, 'paid', 5000) // different project → excluded

    const res = await request(createApp())
      .get(`/api/v1/projects/${pid}`)
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.project.poCap).toBe(1000)
    expect(res.body.project.poConsumed).toBe(500)
    expect(res.body.project.poRemaining).toBe(500)
    // Cap input itself is also on the payload (stored), balance is computed.
    expect(res.body.project.id).toBe(pid)
  })

  it('legacy project with no poCap → poCap/poRemaining null, poConsumed 0', async () => {
    const adminId = new ObjectId().toString()
    setupDb()
    const pid = seedProjectDoc() // no poCap key at all
    mockAuth(adminId, 'admin')

    const res = await request(createApp())
      .get(`/api/v1/projects/${pid}`)
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.project.poCap).toBeNull()
    expect(res.body.project.poConsumed).toBe(0)
    expect(res.body.project.poRemaining).toBeNull()
  })

  it('over-billing reports a negative poRemaining (balance is live, never clamped)', async () => {
    const adminId = new ObjectId().toString()
    setupDb()
    const pid = seedProjectDoc({ poCap: 100 })
    mockAuth(adminId, 'admin')
    seedInvoice(pid, 'paid', 300)

    const res = await request(createApp())
      .get(`/api/v1/projects/${pid}`)
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.project.poConsumed).toBe(300)
    expect(res.body.project.poRemaining).toBe(-200)
  })

  it('non-member still gets 403 (access guard unchanged by the PO addition)', async () => {
    const userId = new ObjectId().toString()
    setupDb()
    const pid = seedProjectDoc() // teamMemberIds: [] → not a member
    mockAuth(userId, 'user')

    const res = await request(createApp())
      .get(`/api/v1/projects/${pid}`)
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('poCap is a create/update input; balance fields are never persisted', async () => {
    setupDb()
    const created = await createProject({
      name: 'PO project',
      sowNumber: 'SOW-PO',
      client: 'Acme',
      description: 'd',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      deadline: '2025-12-01',
      status: 'active',
      managerId: new ObjectId().toString(),
      supervisorId: new ObjectId().toString(),
      teamMemberIds: [],
      hourlyRate: 50,
      poCap: 5000,
    })
    expect(created.poCap).toBe(5000)
    // Only the cap input lives on the stored doc — no computed balances stored.
    const stored = cols[COLLECTIONS.PROJECTS].store.find((d) => String((d as any)._id) === created.id) as Record<string, any>
    expect(stored.poCap).toBe(5000)
    expect(stored).not.toHaveProperty('poConsumed')
    expect(stored).not.toHaveProperty('poRemaining')

    const updated = await updateProject(created.id, { poCap: 900 })
    expect(updated?.poCap).toBe(900)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Assignment lifecycle — rollover completed assignments (§5 item 3)
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — assignment lifecycle rollover (§5 item 3)', () => {
  function seedAssignment(endDate: string, status: string): string {
    const _id = new ObjectId()
    cols[COLLECTIONS.ASSIGNMENTS].store.push({
      _id,
      projectId: new ObjectId(),
      userId: new ObjectId(),
      startDate: '2025-01-01',
      endDate,
      status,
      hourlyRate: 50,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    })
    return _id.toString()
  }

  it('service: active + past endDate → completed; future/onHold/legacy-completed untouched; idempotent', async () => {
    setupDb()
    const overdue = seedAssignment('2025-06-01', 'active')
    const future = seedAssignment('2025-07-01', 'active')
    const hold = seedAssignment('2025-01-01', 'onHold')
    const already = seedAssignment('2025-01-01', 'completed')

    const asOf = new Date('2025-06-15T00:00:00.000Z')
    const result = await rolloverCompletedAssignments(asOf)
    expect(result).toEqual({ matched: 1, completed: 1, asOf: '2025-06-15' })

    const statusOf = (id: string) =>
      cols[COLLECTIONS.ASSIGNMENTS].store.find((d) => String(d._id) === id)!.status
    expect(statusOf(overdue)).toBe('completed')
    expect(statusOf(future)).toBe('active')
    expect(statusOf(hold)).toBe('onHold') // onHold never auto-rolls (Phase 6 rule)
    expect(statusOf(already)).toBe('completed')

    // Second run over the same window matches nothing → manual idempotent re-run.
    const again = await rolloverCompletedAssignments(asOf)
    expect(again).toEqual({ matched: 0, completed: 0, asOf: '2025-06-15' })
  })

  it('POST /assignments/cron/rollover → 401 without the CRON_SECRET bearer', async () => {
    const res = await request(createApp()).post('/api/v1/assignments/cron/rollover')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')

    const wrong = await request(createApp())
      .post('/api/v1/assignments/cron/rollover')
      .set('Authorization', 'Bearer wrong-secret')
    expect(wrong.status).toBe(401)
  })

  it('GET on the cron endpoint → 404 (POST-only registration; rollover never fires)', async () => {
    setupDb()
    const overdue = seedAssignment('2025-01-01', 'active')

    const res = await request(createApp())
      .get('/api/v1/assignments/cron/rollover')
      .set('Authorization', 'Bearer test-cron-secret-do-not-use-in-production')
    // Same as timesheet/notifications cron: router.post only → Express 404s GET,
    // so the handler (and the rollover side effect) is unreachable for non-POST.
    expect(res.status).toBe(404)
    const row = cols[COLLECTIONS.ASSIGNMENTS].store.find((d) => String(d._id) === overdue)!
    expect(row.status).toBe('active') // single-send: nothing mutated
  })

  it('whitespace-only CRON_SECRET → 500 CONFIG_ERROR (mirrors timesheet cron trim)', async () => {
    process.env.CRON_SECRET = '   '
    const res = await request(createApp())
      .post('/api/v1/assignments/cron/rollover')
      .set('Authorization', 'Bearer    ')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('CONFIG_ERROR')
  })

  it('POST with correct secret → 200 counts and actually rolls past assignments', async () => {
    setupDb()
    const overdue = seedAssignment('2025-01-01', 'active')
    seedAssignment('2099-12-31', 'active') // future → untouched

    const res = await request(createApp())
      .post('/api/v1/assignments/cron/rollover')
      .set('Authorization', 'Bearer test-cron-secret-do-not-use-in-production')
    const today = new Date().toISOString().slice(0, 10)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ matched: 1, completed: 1, asOf: today })

    const rolled = cols[COLLECTIONS.ASSIGNMENTS].store.find((d) => String(d._id) === overdue)!
    expect(rolled.status).toBe('completed')
  })

  it('CRON_SECRET missing → 500 CONFIG_ERROR (single body, no crash leak)', async () => {
    delete process.env.CRON_SECRET
    const res = await request(createApp())
      .post('/api/v1/assignments/cron/rollover')
      .set('Authorization', 'Bearer anything')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('CONFIG_ERROR')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Status mapping — docx workflow labels on the FROZEN enum + isLocked out
// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 8 — status mapping documented without enum renames (§5 item 4)', () => {
  it('maps the six docx labels onto the frozen TimesheetStatus values', () => {
    const labels = Object.fromEntries(TIMESHEET_STATUS_FLOW.map((s) => [s.label, s.status]))
    expect(labels).toEqual({
      Draft: 'draft',
      Submitted: 'pending',
      Rejected: 'declined',
      Resubmitted: 'pending', // reuses 'pending' — no new status value invented
      Approved: 'approved',
      Locked: 'approved', // Locked = approved + isLocked, NOT a new status
    })
    // Every mapped status is a real TimesheetStatus literal (compile + runtime guard).
    const valid = ['draft', 'pending', 'approved', 'declined', 'withdrawn']
    for (const entry of TIMESHEET_STATUS_FLOW) {
      expect(valid).toContain(entry.status)
    }
    const locked = TIMESHEET_STATUS_FLOW.find((e) => e.label === 'Locked')!
    expect(locked.isLocked).toBe(true)
    // Entries are the frozen set — adding/renaming a status breaks this test.
    expect(TIMESHEET_STATUS_FLOW.map((e) => e.label).sort()).toEqual(
      ['Approved', 'Draft', 'Locked', 'Rejected', 'Resubmitted', 'Submitted'].sort(),
    )
  })

  it('GET /timesheets/:id exposes isLocked=true for a locked (approved) row', async () => {
    const ownerId = new ObjectId().toString()
    setupDb()
    const projectId = seedProjectDoc()
    const lockedId = new ObjectId()
    cols[COLLECTIONS.TIMESHEETS].store.push({
      _id: lockedId,
      userId: new ObjectId(ownerId),
      projectId: new ObjectId(projectId),
      weekStart: '2025-03-03',
      entries: [],
      notes: 'done',
      regularHours: 40,
      overtimeHours: 0,
      totalHours: 40,
      status: 'approved',
      isLocked: true,
      submittedAt: new Date('2025-03-10'),
      createdAt: new Date('2025-03-03'),
      updatedAt: new Date('2025-03-11'),
    })
    mockAuth(ownerId, 'user')

    const res = await request(createApp())
      .get(`/api/v1/timesheets/${lockedId}`)
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.timesheet.status).toBe('approved')
    expect(res.body.timesheet.isLocked).toBe(true)
  })

  it('legacy locked row without the isLocked key → omitted (never false-filled)', async () => {
    const ownerId = new ObjectId().toString()
    setupDb()
    const projectId = seedProjectDoc()
    const legacyId = new ObjectId()
    cols[COLLECTIONS.TIMESHEETS].store.push({
      _id: legacyId,
      userId: new ObjectId(ownerId),
      projectId: new ObjectId(projectId),
      weekStart: '2025-03-03',
      entries: [],
      notes: 'legacy',
      regularHours: 40,
      overtimeHours: 0,
      totalHours: 40,
      status: 'approved',
      createdAt: new Date('2025-03-03'),
      updatedAt: new Date('2025-03-11'),
    })
    mockAuth(ownerId, 'user')

    const res = await request(createApp())
      .get(`/api/v1/timesheets/${legacyId}`)
      .set('Authorization', 'Bearer t')
    expect(res.status).toBe(200)
    expect(res.body.timesheet).not.toHaveProperty('isLocked')
  })
})
