import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import * as jwt from '../lib/jwt.js'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { previousPeriod } from '../services/payrollcalc.service.js'
import { toPayrollCsv } from '../routes/payroll.js'
import { toReportCsv } from '../routes/reports.js'
import type { UserRole } from '../types/auth.js'

vi.mock('../lib/mongodb', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}))

vi.mock('../lib/jwt', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}))

vi.mock('../services/activity.service', () => ({
  createActivity: vi.fn().mockResolvedValue({ id: '' }),
}))

// ── mocks ────────────────────────────────────────────────────────────────────

function createMockCursor(docs: any[] = []) {
  const cursor: any = {
    _docs: docs,
    sort: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    skip: vi.fn(() => cursor),
    project: vi.fn(() => cursor),
    toArray: vi.fn(async () => docs),
  }
  return cursor
}

function createMockCollection() {
  const collection: any = {
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockImplementation(async (doc: any) => ({ insertedId: doc._id ?? new ObjectId() })),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    find: vi.fn(() => createMockCursor()),
    aggregate: vi.fn(() => createMockCursor()),
  }
  return collection
}

let mockDb: any
let usersCol: any
let timesheetsCol: any
let payrollsCol: any
let payrateHistoryCol: any
let projectsCol: any

const knownUsers = new Map<string, any>()

function setupDbMocks() {
  usersCol = createMockCollection()
  timesheetsCol = createMockCollection()
  payrollsCol = createMockCollection()
  payrateHistoryCol = createMockCollection()
  projectsCol = createMockCollection()
  knownUsers.clear()

  usersCol.findOne = vi.fn(async ({ _id }: any) => knownUsers.get(String(_id)) ?? null)
  // `users.find` backs payroll name/rate resolution and report name lookups.
  usersCol.find = vi.fn((query: any) => {
    const wanted = query?._id?.$in ? query._id.$in.map(String) : null
    const docs = [...knownUsers.entries()]
      .filter(([id]) => (wanted ? wanted.includes(id) : true))
      .map(([, user]) => user)
    return createMockCursor(docs)
  })

  const map: Record<string, any> = {
    [COLLECTIONS.USERS]: usersCol,
    [COLLECTIONS.TIMESHEETS]: timesheetsCol,
    [COLLECTIONS.PAYROLLS]: payrollsCol,
    [COLLECTIONS.PAYRATE_HISTORY]: payrateHistoryCol,
    [COLLECTIONS.PROJECTS]: projectsCol,
  }

  mockDb = { collection: vi.fn((name: string) => map[name] ?? createMockCollection()) }
  vi.mocked(getDb).mockResolvedValue(mockDb as any)
}

let idCounter = 0
function makeId(): string {
  idCounter++
  return `507f1f77bcf86cd7${idCounter.toString(16).padStart(8, '0')}`
}

function mockUser(id: string, overrides: Partial<any> = {}): any {
  return {
    _id: new ObjectId(id),
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: 'hashed',
    employeeId: 'E000001',
    department: 'Engineering',
    role: 'employee',
    isSupervisor: false,
    status: 'active',
    billable: true,
    payRate: 80,
    currency: 'USD',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function setupAuth(role: UserRole, overrides: Partial<any> = {}) {
  const userId = makeId()
  vi.mocked(jwt.verifyAccessToken).mockResolvedValue({
    userId,
    role,
    billable: false,
    exp: 9999999999,
  } as any)
  knownUsers.set(userId, mockUser(userId, { role, name: `${role} Actor`, ...overrides }))
  return userId
}

const app = createApp()

function authed(target: any): any {
  const header = { Authorization: 'Bearer valid-token' }
  return {
    get: (url: string) => target.get(url).set(header),
    post: (url: string) => target.post(url).set(header),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setupDbMocks()
})

/** A weekly timesheet as the platform writes it. */
function timesheet(overrides: Partial<any> = {}): any {
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    projectId: new ObjectId(),
    weekStart: '2026-09-07',
    regularHours: 40,
    overtimeHours: 0,
    totalHours: 40,
    status: 'approved',
    ...overrides,
  }
}

/** Seed the timesheets collection with a filter-aware mock. */
function seedTimesheets(docs: any[]): void {
  timesheetsCol.find = vi.fn((query: any) => {
    let result = docs
    if (query?.status) {
      const wanted = Array.isArray(query.status.$in) ? query.status.$in : [query.status]
      result = result.filter((d) => wanted.includes(d.status))
    }
    if (query?.weekStart?.$regex) {
      const prefix = String(query.weekStart.$regex).replace(/^\^/, '')
      result = result.filter((d) => String(d.weekStart).startsWith(prefix))
    }
    if (query?.weekStart?.$gte) {
      result = result.filter((d) => d.weekStart >= query.weekStart.$gte && d.weekStart <= query.weekStart.$lte)
    }
    if (query?.userId) {
      const ids = Array.isArray(query.userId.$in) ? query.userId.$in.map(String) : [String(query.userId)]
      result = result.filter((d) => ids.includes(String(d.userId)))
    }
    if (query?.projectId) {
      result = result.filter((d) => String(d.projectId) === String(query.projectId))
    }
    return createMockCursor(result)
  })
}

// ── GET /payroll ─────────────────────────────────────────────────────────────

describe('GET /payroll', () => {
  it('403s an employee', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).get('/api/v1/payroll?period=2026-09')
    expect(res.status).toBe(403)
  })

  it('lets hr read it', async () => {
    setupAuth('hr')
    seedTimesheets([])
    const res = await authed(request(app)).get('/api/v1/payroll?period=2026-09')
    expect(res.status).toBe(200)
  })

  it('sums approved hours x payRate into gross', async () => {
    setupAuth('admin')
    const workerId = makeId()
    knownUsers.set(workerId, mockUser(workerId, { name: 'Esha Engineer', payRate: 90, role: 'engineer' }))

    seedTimesheets([
      timesheet({ userId: new ObjectId(workerId), totalHours: 40 }),
      timesheet({ userId: new ObjectId(workerId), totalHours: 32, weekStart: '2026-09-14' }),
    ])

    const res = await authed(request(app)).get('/api/v1/payroll?period=2026-09')
    expect(res.status).toBe(200)
    expect(res.body.period).toBe('2026-09')
    expect(res.body.rows).toHaveLength(1)
    expect(res.body.rows[0]).toMatchObject({
      userId: workerId,
      employeeName: 'Esha Engineer',
      role: 'engineer',
      period: '2026-09',
      hours: 72,
      payRate: 90,
      gross: 6480,
      status: 'draft',
    })
    expect(res.body.totalGross).toBe(6480)
  })

  it('excludes non-approved timesheets', async () => {
    setupAuth('admin')
    const workerId = makeId()
    knownUsers.set(workerId, mockUser(workerId, { name: 'Draft Only', payRate: 100 }))

    seedTimesheets([
      timesheet({ userId: new ObjectId(workerId), status: 'draft', totalHours: 40 }),
      timesheet({ userId: new ObjectId(workerId), status: 'pending', totalHours: 40, weekStart: '2026-09-14' }),
      timesheet({ userId: new ObjectId(workerId), status: 'declined', totalHours: 8, weekStart: '2026-09-21' }),
    ])

    const res = await authed(request(app)).get('/api/v1/payroll?period=2026-09')
    expect(res.status).toBe(200)
    expect(res.body.rows).toHaveLength(0)
    expect(res.body.totalGross).toBe(0)
  })

  it('promotes a row to approved once the period is closed', async () => {
    setupAuth('admin')
    const workerId = makeId()
    knownUsers.set(workerId, mockUser(workerId, { name: 'Closed Worker', payRate: 50 }))
    seedTimesheets([timesheet({ userId: new ObjectId(workerId), totalHours: 10 })])

    payrollsCol.find = vi.fn(() => createMockCursor([{ userId: new ObjectId(workerId), resourceId: new ObjectId(workerId) }]))

    const res = await authed(request(app)).get('/api/v1/payroll?period=2026-09')
    expect(res.body.rows[0].status).toBe('approved')
  })

  it('surfaces pay-rate changes from the period', async () => {
    setupAuth('admin')
    seedTimesheets([])
    payrateHistoryCol.find = vi.fn(() =>
      createMockCursor([
        {
          _id: new ObjectId(),
          userId: new ObjectId(),
          oldRate: 70,
          newRate: 85,
          currency: 'USD',
          reason: 'Promotion',
          changedBy: new ObjectId(),
          createdAt: new Date('2026-09-10T00:00:00.000Z'),
        },
      ]),
    )

    const res = await authed(request(app)).get('/api/v1/payroll?period=2026-09')
    expect(res.body.rateChanges).toHaveLength(1)
    expect(res.body.rateChanges[0]).toMatchObject({ oldRate: 70, newRate: 85, reason: 'Promotion' })
  })

  it('defaults to the previous period', async () => {
    setupAuth('admin')
    seedTimesheets([])
    const res = await authed(request(app)).get('/api/v1/payroll')
    expect(res.body.period).toBe(previousPeriod())
  })

  it('400s a malformed period', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).get('/api/v1/payroll?period=Sept-2026')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('previousPeriod rolls back across a year boundary', () => {
    expect(previousPeriod(new Date('2026-01-15T00:00:00.000Z'))).toBe('2025-12')
  })
})

// ── GET /payroll/export ──────────────────────────────────────────────────────

describe('GET /payroll/export', () => {
  it('serves a CSV attachment', async () => {
    setupAuth('admin')
    seedTimesheets([])
    const res = await authed(request(app)).get('/api/v1/payroll/export?period=2026-09&format=csv')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toBe('attachment; filename="payroll-2026-09.csv"')
    expect(res.text).toContain('Employee,Role,Period,Hours,Rate,Currency,Gross,Status')
  })

  it('serves a PDF attachment', async () => {
    setupAuth('admin')
    seedTimesheets([])
    const res = await authed(request(app)).get('/api/v1/payroll/export?period=2026-09&format=pdf')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect(res.headers['content-disposition']).toBe('attachment; filename="payroll-2026-09.pdf"')
    // A real PDF starts with the %PDF magic bytes.
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('rejects an unsupported format', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).get('/api/v1/payroll/export?format=xlsx')
    expect(res.status).toBe(400)
  })

  it('403s an employee', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).get('/api/v1/payroll/export?format=csv')
    expect(res.status).toBe(403)
  })
})

describe('toPayrollCsv', () => {
  it('escapes commas, quotes and newlines per RFC 4180', () => {
    const csv = toPayrollCsv(
      '2026-09',
      [
        {
          id: '1',
          userId: 'u1',
          employeeName: 'Doe, Jane',
          role: 'eng',
          billable: true,
          period: '2026-09',
          hours: 40,
          payRate: 10,
          currency: 'USD',
          gross: 400,
          status: 'draft',
        },
        {
          id: '2',
          userId: 'u2',
          employeeName: 'He said "hi"',
          role: 'eng',
          billable: true,
          period: '2026-09',
          hours: 1,
          payRate: 1,
          currency: 'USD',
          gross: 1,
          status: 'draft',
        },
      ],
      401,
    )
    expect(csv).toContain('"Doe, Jane"')
    expect(csv).toContain('"He said ""hi"""')
    expect(csv.split('\r\n')[0]).toBe('Employee,Role,Period,Hours,Rate,Currency,Gross,Status')
  })
})

// ── POST /payroll/close ──────────────────────────────────────────────────────

describe('POST /payroll/close', () => {
  it('403s hr (close is admin-only in v1)', async () => {
    setupAuth('hr')
    const res = await authed(request(app)).post('/api/v1/payroll/close').send({ period: '2026-09' })
    expect(res.status).toBe(403)
  })

  it('403s a manager', async () => {
    setupAuth('manager')
    const res = await authed(request(app)).post('/api/v1/payroll/close').send({ period: '2026-09' })
    expect(res.status).toBe(403)
  })

  it('400s a malformed period', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).post('/api/v1/payroll/close').send({ period: '2026-13' })
    expect(res.status).toBe(400)
  })

  it('422s a period with nothing approved to close', async () => {
    setupAuth('admin')
    seedTimesheets([])
    const res = await authed(request(app)).post('/api/v1/payroll/close').send({ period: '2026-09' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('PAYROLL_EMPTY')
  })

  it('writes one snapshot row per timesheet with resourceId + timesheetId', async () => {
    setupAuth('admin')
    const workerId = makeId()
    knownUsers.set(workerId, mockUser(workerId, { payRate: 100 }))
    const sheet = timesheet({ userId: new ObjectId(workerId), totalHours: 20 })
    seedTimesheets([sheet])

    const res = await authed(request(app)).post('/api/v1/payroll/close').send({ period: '2026-09' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ period: '2026-09', rowsWritten: 1, totalGross: 2000 })

    expect(payrollsCol.updateOne).toHaveBeenCalledTimes(1)
    const [filter, update] = payrollsCol.updateOne.mock.calls[0]
    // Upserting on timesheetId is what keeps a re-close idempotent.
    expect(String(filter.timesheetId)).toBe(String(sheet._id))
    expect(update.$set).toMatchObject({
      resourceId: sheet.userId,
      userId: sheet.userId,
      period: '2026-09',
      grossHours: 20,
      grossPay: 2000,
      status: 'approved',
    })
    expect(update.$setOnInsert).toHaveProperty('createdAt')
  })

  it('re-closing upserts instead of duplicating', async () => {
    setupAuth('admin')
    const workerId = makeId()
    knownUsers.set(workerId, mockUser(workerId, { payRate: 100 }))
    seedTimesheets([timesheet({ userId: new ObjectId(workerId), totalHours: 20 })])

    await authed(request(app)).post('/api/v1/payroll/close').send({ period: '2026-09' })
    const res = await authed(request(app)).post('/api/v1/payroll/close').send({ period: '2026-09' })

    expect(res.status).toBe(201)
    for (const call of payrollsCol.updateOne.mock.calls) {
      expect(call[2]).toMatchObject({ upsert: true })
    }
  })
})

// ── POST /reports/query ──────────────────────────────────────────────────────

describe('POST /reports/query', () => {
  it('403s an employee and points them at employee-stats', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).post('/api/v1/reports/query').send({ dateRange: '30d' })
    expect(res.status).toBe(403)
    expect(res.body.error.message).toMatch(/employee-stats/)
  })

  it('defaults dateRange to 30d', async () => {
    setupAuth('admin')
    seedTimesheets([])
    const res = await authed(request(app)).post('/api/v1/reports/query').send({})
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('hoursByProject')
    expect(res.body).toHaveProperty('hoursByEmployee')
    expect(res.body).toHaveProperty('overtimeStats')
    expect(res.body).toHaveProperty('statusBreakdown')
  })

  it('400s a custom range missing its dates', async () => {
    setupAuth('admin')
    const res = await authed(request(app)).post('/api/v1/reports/query').send({ dateRange: 'custom' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_RANGE')
  })

  it('400s an inverted custom range', async () => {
    setupAuth('admin')
    const res = await authed(request(app))
      .post('/api/v1/reports/query')
      .send({ dateRange: 'custom', startDate: '2026-09-30', endDate: '2026-09-01' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_RANGE')
  })

  it('aggregates regular/overtime/total per project', async () => {
    setupAuth('admin')
    const projectId = makeId()
    const a = makeId()
    const b = makeId()
    knownUsers.set(a, mockUser(a, { name: 'Ana', department: 'Engineering' }))
    knownUsers.set(b, mockUser(b, { name: 'Ben', department: 'Design' }))
    projectsCol.find = vi.fn(() => createMockCursor([{ _id: new ObjectId(projectId), name: 'Acme Portal' }]))

    const today = new Date().toISOString().slice(0, 10)
    seedTimesheets([
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(a), regularHours: 40, overtimeHours: 0, totalHours: 40, weekStart: today }),
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(b), regularHours: 30, overtimeHours: 10, totalHours: 40, weekStart: today }),
    ])

    const res = await authed(request(app)).post('/api/v1/reports/query').send({ dateRange: '30d' })
    expect(res.status).toBe(200)

    expect(res.body.hoursByProject).toHaveLength(1)
    expect(res.body.hoursByProject[0]).toMatchObject({
      projectId,
      projectName: 'Acme Portal',
      regularHours: 70,
      overtimeHours: 10,
      totalHours: 80,
    })

    expect(res.body.hoursByEmployee).toHaveLength(2)
    const ben = res.body.hoursByEmployee.find((e: any) => e.userId === b)
    expect(ben).toMatchObject({ userName: 'Ben', department: 'Design', totalHours: 40 })

    expect(res.body.overtimeStats).toEqual({ regularHours: 70, overtimeHours: 10, totalHours: 80 })
  })

  it('honours status=approved so draft hours never count', async () => {
    setupAuth('admin')
    const projectId = makeId()
    const worker = makeId()
    projectsCol.find = vi.fn(() => createMockCursor([]))
    const today = new Date().toISOString().slice(0, 10)

    seedTimesheets([
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 40, status: 'approved', weekStart: today }),
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 40, status: 'draft', weekStart: today }),
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 8, status: 'pending', weekStart: today }),
    ])

    const res = await authed(request(app)).post('/api/v1/reports/query').send({ dateRange: '30d', status: 'approved' })
    expect(res.body.overtimeStats.totalHours).toBe(40)
    // The breakdown still shows the full distribution in range.
    expect(res.body.statusBreakdown).toMatchObject({ approved: 1, draft: 1, pending: 1 })
  })

  it('defaults to approved-only hours when status is omitted (QA M8)', async () => {
    setupAuth('admin')
    const projectId = makeId()
    const worker = makeId()
    projectsCol.find = vi.fn(() => createMockCursor([]))
    const today = new Date().toISOString().slice(0, 10)

    seedTimesheets([
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 40, status: 'approved', weekStart: today }),
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 40, status: 'draft', weekStart: today }),
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 12, status: 'declined', weekStart: today }),
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 8, status: 'withdrawn', weekStart: today }),
    ])

    // No `status` key at all: an omitted filter must mean "approved", not "all".
    const res = await authed(request(app)).post('/api/v1/reports/query').send({ dateRange: '30d' })
    expect(res.body.overtimeStats.totalHours).toBe(40)
    // The breakdown still reports the full distribution.
    expect(res.body.statusBreakdown).toMatchObject({ approved: 1, draft: 1, declined: 1, withdrawn: 1 })
  })

  it("status=all counts every timesheet's hours", async () => {
    setupAuth('admin')
    const projectId = makeId()
    const worker = makeId()
    projectsCol.find = vi.fn(() => createMockCursor([]))
    const today = new Date().toISOString().slice(0, 10)

    seedTimesheets([
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 40, status: 'approved', weekStart: today }),
      timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 40, status: 'draft', weekStart: today }),
    ])

    const res = await authed(request(app)).post('/api/v1/reports/query').send({ dateRange: '30d', status: 'all' })
    expect(res.body.overtimeStats.totalHours).toBe(80)
  })

  it('breaks an empty org into all-zero shapes, not an error', async () => {
    setupAuth('admin')
    seedTimesheets([])
    const res = await authed(request(app)).post('/api/v1/reports/query').send({ dateRange: '30d' })
    expect(res.status).toBe(200)
    expect(res.body.hoursByProject).toEqual([])
    expect(res.body.hoursByEmployee).toEqual([])
    expect(res.body.overtimeStats).toEqual({ regularHours: 0, overtimeHours: 0, totalHours: 0 })
    expect(res.body.statusBreakdown).toEqual({ draft: 0, pending: 0, approved: 0, declined: 0, withdrawn: 0 })
  })



})

// ── GET /reports/employee-stats ──────────────────────────────────────────────

describe('GET /reports/employee-stats', () => {
  it('is self-scoped and omits the org-wide employee roll-up', async () => {
    const userId = setupAuth('employee')
    const projectId = makeId()
    projectsCol.find = vi.fn(() => createMockCursor([{ _id: new ObjectId(projectId), name: 'Acme Portal' }]))
    const today = new Date().toISOString().slice(0, 10)
    seedTimesheets([timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(userId), totalHours: 20, weekStart: today })])

    const res = await authed(request(app)).get('/api/v1/reports/employee-stats?dateRange=30d')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('hoursByProject')
    expect(res.body).toHaveProperty('overtimeStats')
    expect(res.body).toHaveProperty('statusBreakdown')
    // The frontend type has no hoursByEmployee here.
    expect(res.body).not.toHaveProperty('hoursByEmployee')
    expect(res.body.overtimeStats.totalHours).toBe(20)
  })

  it('lets any role read their own stats', async () => {
    setupAuth('employee')
    projectsCol.find = vi.fn(() => createMockCursor([]))
    seedTimesheets([])
    const res = await authed(request(app)).get('/api/v1/reports/employee-stats')
    expect(res.status).toBe(200)
  })

  it('400s a custom range with no dates', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).get('/api/v1/reports/employee-stats?dateRange=custom')
    expect(res.status).toBe(400)
  })
})

// ── POST /reports/export ─────────────────────────────────────────────────────

describe('POST /reports/export', () => {
  it('serves a CSV attachment with every table', async () => {
    setupAuth('admin')
    const projectId = makeId()
    const worker = makeId()
    knownUsers.set(worker, mockUser(worker, { name: 'Ana', department: 'Engineering' }))
    projectsCol.find = vi.fn(() => createMockCursor([{ _id: new ObjectId(projectId), name: 'Acme Portal' }]))
    const today = new Date().toISOString().slice(0, 10)
    seedTimesheets([timesheet({ projectId: new ObjectId(projectId), userId: new ObjectId(worker), totalHours: 40, weekStart: today })])

    const res = await authed(request(app)).post('/api/v1/reports/export').send({ dateRange: '30d' })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    expect(res.headers['content-disposition']).toBe('attachment; filename="report-30d.csv"')
    expect(res.text).toContain('Hours by project')
    expect(res.text).toContain('Hours by employee')
    expect(res.text).toContain('Overtime totals')
    expect(res.text).toContain('Timesheet status breakdown')
  })

  it('403s an employee', async () => {
    setupAuth('employee')
    const res = await authed(request(app)).post('/api/v1/reports/export').send({ dateRange: '30d' })
    expect(res.status).toBe(403)
  })
})

describe('toReportCsv', () => {
  it('labels each block so the sheet stays readable', () => {
    const csv = toReportCsv({
      hoursByProject: [
        { projectId: 'p1', projectName: 'Acme, Inc', regularHours: 40, overtimeHours: 0, totalHours: 40 },
      ],
      hoursByEmployee: [],
      overtimeStats: { regularHours: 40, overtimeHours: 0, totalHours: 40 },
      statusBreakdown: { draft: 1, pending: 2, approved: 3, declined: 4, withdrawn: 5 },
    })
    expect(csv).toContain('"Acme, Inc"')
    expect(csv).toContain('Draft,Pending,Approved,Declined,Withdrawn')
    expect(csv).toContain('1,2,3,4,5')
  })
})