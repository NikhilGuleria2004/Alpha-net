import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
// @ts-ignore — supertest ships without types here; same pattern as auth.test.ts
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { COLLECTIONS } from '../lib/collections.js'
import { invalidateUserCache } from '../middleware/auth.js'
import { getDayOfWeekFromDateString } from '../schemas/daily-timesheet.schema.js'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')

// ts.md Phase 4 — daily timesheet HTTP surface at /api/v1/timesheets/daily.
// The Db is replaced by a small in-memory Mongo (same matcher/update harness as
// daily-timesheet-service.test.ts, extended with $in), and JWTs are stubbed, so
// these tests exercise the real routing, auth middleware, access guards,
// Zod schemas, controller error mapping and the auto-compile hook together.

const ADMIN_ID = '507f1f77bcf86cd7994390d4'
const SUPERVISOR_ID = '507f1f77bcf86cd7994390c3'
const EMPLOYEE_A = '507f1f77bcf86cd7994390a1'
const EMPLOYEE_B = '507f1f77bcf86cd7994390b2'
const OUTSIDER_ID = '507f1f77bcf86cd7994390e5'

const PROJECT_ID = '507f1f77bcf86cd7994390f6'
const ENTRY_A = '507f1f77bcf86cd799439108'
const ENTRY_B = '507f1f77bcf86cd799439107'
const ENTRY_LOCKED = '507f1f77bcf86cd799439109'
const ENTRY_OTHER_PROJECT = '507f1f77bcf86cd799439110'
const WEEKLY_B = '507f1f77bcf86cd799439120'
const PROJECT_2 = '507f1f77bcf86cd7994390f7'

const MONDAY = '2026-09-28' // a Monday — weekStart used across the fixtures
const TUESDAY = '2026-09-29'
const NEXT_WEEK_MONDAY = '2026-10-05' // a Monday with no seeded rows for anyone

type Doc = Record<string, any>

function fieldMatches(actual: any, expected: any): boolean {
  if (expected instanceof ObjectId) return actual?.toString() === expected.toString()
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime()
  if (expected === null) return actual === null || actual === undefined
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$ne' in expected) return actual?.toString() !== expected.$ne?.toString()
    if ('$in' in expected && Array.isArray(expected.$in)) {
      return expected.$in.some((candidate: any) => fieldMatches(actual, candidate))
    }
    if ('$gte' in expected || '$lte' in expected) {
      if ('$gte' in expected && actual < expected.$gte) return false
      if ('$lte' in expected && actual > expected.$lte) return false
      return true
    }
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((v, i) => fieldMatches(v, expected[i]))
  }
  return actual === expected
}

function matches(doc: Doc, query: Doc): boolean {
  return Object.entries(query ?? {}).every(([key, value]) => {
    if (key === '$or') return (value as Doc[]).some((clause) => matches(doc, clause))
    return fieldMatches(doc?.[key], value)
  })
}

function collectionWith(seed: Doc[] = []) {
  const items: Doc[] = [...seed]

  const rowsFor = (query: Doc, sortSpec?: Doc) => {
    let rows = items.filter((item) => matches(item, query))
    if (sortSpec) {
      const [[key, direction]] = Object.entries(sortSpec) as [string, number][]
      rows = [...rows].sort((a, b) => {
        const av = a[key]
        const bv = b[key]
        if (av === bv) return 0
        return (av > bv ? 1 : -1) * (direction === -1 ? -1 : 1)
      })
    }
    return rows
  }

  const col: any = {
    items,
    insertOne: vi.fn(async (doc: Doc) => {
      const inserted = { _id: doc._id ?? new ObjectId(), ...doc }
      items.push(inserted)
      return { insertedId: inserted._id }
    }),
    findOne: vi.fn(async (query: Doc) => items.find((item) => matches(item, query)) ?? null),
    find: vi.fn((query: Doc = {}) => {
      let sortSpec: Doc | undefined
      const cursor: any = {
        toArray: async () => rowsFor(query, sortSpec),
      }
      cursor.sort = vi.fn((spec: Doc) => {
        sortSpec = spec
        return cursor
      })
      cursor.limit = vi.fn(() => cursor)
      return cursor
    }),
    findOneAndUpdate: vi.fn(async (query: Doc, update: Doc) => {
      const index = items.findIndex((item) => matches(item, query))
      if (index === -1) return null
      if (update?.$set) items[index] = { ...items[index], ...update.$set }
      return items[index]
    }),
    updateOne: vi.fn(async (query: Doc, update: Doc) => {
      const index = items.findIndex((item) => matches(item, query))
      if (index === -1) return { matchedCount: 0, modifiedCount: 0 }
      if (update?.$set) items[index] = { ...items[index], ...update.$set }
      return { matchedCount: 1, modifiedCount: 1 }
    }),
    updateMany: vi.fn(async (query: Doc, update: Doc) => {
      let count = 0
      for (const item of items) {
        if (matches(item, query)) {
          if (update?.$set) Object.assign(item, update.$set)
          count++
        }
      }
      return { matchedCount: count, modifiedCount: count }
    }),
    deleteOne: vi.fn(async (query: Doc) => {
      const index = items.findIndex((item) => matches(item, query))
      if (index === -1) return { deletedCount: 0 }
      items.splice(index, 1)
      return { deletedCount: 1 }
    }),
    createIndex: vi.fn(async () => 'ok'),
  }
  return col
}


// ─── Fixtures ───────────────────────────────────────────────────────────────

function userDoc(id: string, role: string, isSupervisor: boolean, supervisorId?: string): Doc {
  return {
    _id: new ObjectId(id),
    email: `${id}@example.com`,
    name: `User ${id.slice(-2)}`,
    employeeId: id.slice(-6),
    department: 'Engineering',
    role,
    isSupervisor,
    status: 'active',
    ...(supervisorId ? { supervisorId: new ObjectId(supervisorId) } : {}),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

function projectDoc(id: string, name: string, teamMemberIds: string[], supervisorId: string): Doc {
  return {
    _id: new ObjectId(id),
    name,
    status: 'active',
    managerId: new ObjectId(ADMIN_ID),
    supervisorId: new ObjectId(supervisorId),
    teamMemberIds: teamMemberIds.map((userId) => new ObjectId(userId)),
  }
}

function dailyDoc(
  id: string,
  userId: string,
  date: string,
  hours: number,
  opts: { entryType?: 'regular' | 'overtime'; status?: 'draft' | 'locked'; description?: string; projectId?: string } = {}
): Doc {
  const timestamp = new Date(`${date}T08:00:00.000Z`)
  return {
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
    projectId: new ObjectId(opts.projectId ?? PROJECT_ID),
    date,
    dayOfWeek: getDayOfWeekFromDateString(date),
    hours,
    entryType: opts.entryType ?? 'regular',
    description: opts.description ?? 'Built the daily logger',
    status: opts.status ?? 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/** Seeds the shared users/projects/daily rows and returns the collection map. */
function setupDb(seed: Record<string, Doc[]> = {}) {
  const collections: Record<string, any> = {}
  const defaults: Record<string, Doc[]> = {
    [COLLECTIONS.USERS]: [
      userDoc(ADMIN_ID, 'admin', false),
      userDoc(SUPERVISOR_ID, 'user', true),
      userDoc(EMPLOYEE_A, 'user', false, SUPERVISOR_ID),
      userDoc(EMPLOYEE_B, 'user', false, SUPERVISOR_ID),
      userDoc(OUTSIDER_ID, 'user', false),
    ],
    [COLLECTIONS.PROJECTS]: [
      projectDoc(PROJECT_ID, 'Alpha Project', [EMPLOYEE_A, EMPLOYEE_B], SUPERVISOR_ID),
      projectDoc(PROJECT_2, 'Beta Project', [EMPLOYEE_A], ADMIN_ID),
    ],
    [COLLECTIONS.DAILY_TIMESHEETS]: [
      dailyDoc(ENTRY_A, EMPLOYEE_A, MONDAY, 8),
      dailyDoc(ENTRY_OTHER_PROJECT, EMPLOYEE_A, TUESDAY, 4, { projectId: PROJECT_2, description: 'Beta project work' }),
      dailyDoc(ENTRY_B, EMPLOYEE_B, MONDAY, 8, { description: 'Reviewed the pipeline' }),
      dailyDoc(ENTRY_LOCKED, EMPLOYEE_B, TUESDAY, 2, { status: 'locked', description: 'Frozen entry' }),
    ],
    [COLLECTIONS.TIMESHEETS]: [
      {
        _id: new ObjectId(WEEKLY_B),
        userId: new ObjectId(EMPLOYEE_B),
        projectId: new ObjectId(PROJECT_ID),
        weekStart: MONDAY,
        entries: [],
        notes: '',
        regularHours: 8,
        overtimeHours: 0,
        totalHours: 8,
        status: 'draft',
        createdAt: new Date('2026-09-28T00:00:00.000Z'),
        updatedAt: new Date('2026-09-28T00:00:00.000Z'),
      },
    ],
    [COLLECTIONS.ASSIGNMENTS]: [],
  }

  const merged = { ...defaults, ...seed }
  for (const [name, docs] of Object.entries(merged)) {
    collections[name] = collectionWith(docs)
  }

  const collection = vi.fn((name: string) => {
    if (!collections[name]) collections[name] = collectionWith()
    return collections[name]
  })

  vi.mocked(getDb).mockResolvedValue({ collection } as any)
  return collections
}

/** Stubs the bearer token for `userId`; `authenticate` then re-reads the user row. */
function signIn(userId: string, role: string, isSupervisor = false) {
  vi.mocked(verifyAccessToken).mockResolvedValue({ userId, role, isSupervisor, exp: 9_999_999_999 } as any)
}

beforeEach(() => {
  vi.mocked(verifyAccessToken).mockReset()
  vi.mocked(getDb).mockReset()
  // middleware/auth.ts keeps a 60s in-memory user cache; clear it so a role
  // stubbed by one test can never leak into the next.
  for (const id of [ADMIN_ID, SUPERVISOR_ID, EMPLOYEE_A, EMPLOYEE_B, OUTSIDER_ID]) {
    invalidateUserCache(id)
  }
})


function authed(req: any) {
  return req.set('Authorization', 'Bearer test-token')
}

describe('Phase 4 — daily timesheet routes (/api/v1/timesheets/daily)', () => {
  it('4.3 every route is behind authenticate (401 without a token)', async () => {
    setupDb()
    const app = createApp()

    const responses = await Promise.all([
      request(app).get('/api/v1/timesheets/daily'),
      request(app).get(`/api/v1/timesheets/daily/${ENTRY_A}`),
      request(app).post('/api/v1/timesheets/daily').send({}),
      request(app).patch(`/api/v1/timesheets/daily/${ENTRY_A}`).send({ hours: 4 }),
      request(app).delete(`/api/v1/timesheets/daily/${ENTRY_A}`),
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT_ID, weekStart: MONDAY }),
    ])

    for (const res of responses) {
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    }
  })

  it('4.3 an employee only ever sees their own entries', async () => {
    setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    const own = await authed(request(app).get('/api/v1/timesheets/daily'))
    expect(own.status).toBe(200)
    expect(own.body.dailyTimesheets.map((e: any) => e.id).sort()).toEqual([ENTRY_A, ENTRY_OTHER_PROJECT].sort())

    // ?userId pointing elsewhere is a rejection, not a silent empty list
    const foreign = await authed(request(app).get(`/api/v1/timesheets/daily?userId=${EMPLOYEE_B}`))
    expect(foreign.status).toBe(403)
    expect(foreign.body.error.code).toBe('FORBIDDEN')

    // project + week filters narrow within the caller's own rows
    const narrowed = await authed(request(app).get(`/api/v1/timesheets/daily?projectId=${PROJECT_2}&weekStart=${MONDAY}`))
    expect(narrowed.status).toBe(200)
    expect(narrowed.body.dailyTimesheets.map((e: any) => e.id)).toEqual([ENTRY_OTHER_PROJECT])
  })

  it("4.3 employee A cannot read, edit or delete employee B's entry (403)", async () => {
    const collections = setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    const read = await authed(request(app).get(`/api/v1/timesheets/daily/${ENTRY_B}`))
    expect(read.status).toBe(403)
    expect(read.body.error.code).toBe('FORBIDDEN')

    const patch = await authed(request(app).patch(`/api/v1/timesheets/daily/${ENTRY_B}`).send({ hours: 4 }))
    expect(patch.status).toBe(403)
    expect(patch.body.error.code).toBe('FORBIDDEN')

    const remove = await authed(request(app).delete(`/api/v1/timesheets/daily/${ENTRY_B}`))
    expect(remove.status).toBe(403)

    // Nothing was mutated on the way through the guards.
    const stored = collections[COLLECTIONS.DAILY_TIMESHEETS].items.find((e: any) => e._id.toString() === ENTRY_B)
    expect(stored.hours).toBe(8)
  })

  it("4.3 admin can read, edit and delete any employee's entries", async () => {
    const collections = setupDb()
    signIn(ADMIN_ID, 'admin', false)
    const app = createApp()

    const list = await authed(request(app).get(`/api/v1/timesheets/daily?userId=${EMPLOYEE_B}&status=draft`))
    expect(list.status).toBe(200)
    expect(list.body.dailyTimesheets.map((e: any) => e.id)).toEqual([ENTRY_B])

    const read = await authed(request(app).get(`/api/v1/timesheets/daily/${ENTRY_B}`))
    expect(read.status).toBe(200)
    expect(read.body.dailyTimesheet.userId).toBe(EMPLOYEE_B)

    const patch = await authed(
      request(app).patch(`/api/v1/timesheets/daily/${ENTRY_B}`).send({ hours: 5, description: 'Adjusted by admin' })
    )
    expect(patch.status).toBe(200)
    expect(patch.body.dailyTimesheet.hours).toBe(5)

    const remove = await authed(request(app).delete(`/api/v1/timesheets/daily/${ENTRY_A}`))
    expect(remove.status).toBe(204)
    expect(collections[COLLECTIONS.DAILY_TIMESHEETS].items.some((e: any) => e._id.toString() === ENTRY_A)).toBe(false)

    // no userId filter → the whole org (all four seeded rows minus the deleted one)
    const all = await authed(request(app).get('/api/v1/timesheets/daily'))
    expect(all.status).toBe(200)
    expect(all.body.dailyTimesheets).toHaveLength(3)
  })

  it("4.3 supervisor can view a direct report's entries but cannot edit them", async () => {
    setupDb()
    signIn(SUPERVISOR_ID, 'user', true)
    const app = createApp()

    const scoped = await authed(request(app).get(`/api/v1/timesheets/daily?userId=${EMPLOYEE_B}&status=draft`))
    expect(scoped.status).toBe(200)
    expect(scoped.body.dailyTimesheets.map((e: any) => e.id)).toEqual([ENTRY_B])

    const read = await authed(request(app).get(`/api/v1/timesheets/daily/${ENTRY_B}`))
    expect(read.status).toBe(200)
    expect(read.body.dailyTimesheet.userId).toBe(EMPLOYEE_B)

    // Outside the supervisor's span of control → 403.
    const unrelated = await authed(request(app).get(`/api/v1/timesheets/daily?userId=${OUTSIDER_ID}`))
    expect(unrelated.status).toBe(403)

    // Read scope must not become write scope.
    const patch = await authed(request(app).patch(`/api/v1/timesheets/daily/${ENTRY_B}`).send({ hours: 4 }))
    expect(patch.status).toBe(403)

    // A supervisor's own (empty) week still lists.
    const own = await authed(request(app).get('/api/v1/timesheets/daily'))
    expect(own.status).toBe(200)
    expect(own.body.dailyTimesheets).toEqual([])
  })
})


describe('Phase 4 — daily timesheet create, compile and error mapping', () => {
  it('4.1 POST creates the row for the caller and auto-compiles the week', async () => {
    const collections = setupDb({ [COLLECTIONS.TIMESHEETS]: [] })
    signIn(EMPLOYEE_B, 'user', false)
    const app = createApp()

    const res = await authed(
      request(app).post('/api/v1/timesheets/daily').send({
        projectId: PROJECT_ID,
        date: NEXT_WEEK_MONDAY,
        hours: 8,
        entryType: 'regular',
        description: 'Paired on the compiler',
        // A spoofed owner must be ignored: Zod strips unknown keys and the
        // controller always writes for the authenticated user.
        userId: EMPLOYEE_A,
      })
    )

    expect(res.status).toBe(201)
    expect(res.body.dailyTimesheet.userId).toBe(EMPLOYEE_B)
    expect(res.body.dailyTimesheet.date).toBe(NEXT_WEEK_MONDAY)
    expect(res.body.dailyTimesheet.dayOfWeek).toBe('mon')
    expect(res.body.dailyTimesheet.status).toBe('draft')

    const stored = collections[COLLECTIONS.DAILY_TIMESHEETS].items.find(
      (e: any) => e._id.toString() === res.body.dailyTimesheet.id
    )
    expect(stored.userId.toString()).toBe(EMPLOYEE_B)

    // The Phase 3 auto-compile hook created the weekly parent and linked the row.
    const weeklies = collections[COLLECTIONS.TIMESHEETS].items
    expect(weeklies).toHaveLength(1)
    expect(weeklies[0].userId.toString()).toBe(EMPLOYEE_B)
    expect(weeklies[0].weekStart).toBe(NEXT_WEEK_MONDAY)
    expect(weeklies[0].totalHours).toBe(8)
    expect(stored.weeklyTimesheetId.toString()).toBe(weeklies[0]._id.toString())
  })

  it('4.1 validation failures map to 400 VALIDATION_ERROR', async () => {
    setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    const tooManyHours = await authed(
      request(app).post('/api/v1/timesheets/daily').send({ projectId: PROJECT_ID, date: MONDAY, hours: 30, description: 'Too much time' })
    )
    expect(tooManyHours.status).toBe(400)
    expect(tooManyHours.body.error.code).toBe('VALIDATION_ERROR')

    const impossibleDate = await authed(
      request(app).post('/api/v1/timesheets/daily').send({ projectId: PROJECT_ID, date: '2026-02-31', hours: 4, description: 'Impossible date' })
    )
    expect(impossibleDate.status).toBe(400)

    const emptyPatch = await authed(request(app).patch(`/api/v1/timesheets/daily/${ENTRY_A}`).send({}))
    expect(emptyPatch.status).toBe(400)

    const badFilter = await authed(request(app).get('/api/v1/timesheets/daily?userId=not-an-object-id'))
    expect(badFilter.status).toBe(400)

    // An unknown id never resolves to a row, so the guard denies it.
    const unknownEntry = await authed(request(app).patch('/api/v1/timesheets/daily/507f1f77bcf86cd799439199').send({ hours: 4 }))
    expect(unknownEntry.status).toBe(403)
  })

  it('4.1 a locked entry rejects updates and deletes with 409 CONFLICT', async () => {
    setupDb()
    signIn(EMPLOYEE_B, 'user', false)
    const app = createApp()

    const patch = await authed(request(app).patch(`/api/v1/timesheets/daily/${ENTRY_LOCKED}`).send({ hours: 4 }))
    expect(patch.status).toBe(409)
    expect(patch.body.error.code).toBe('CONFLICT')

    const remove = await authed(request(app).delete(`/api/v1/timesheets/daily/${ENTRY_LOCKED}`))
    expect(remove.status).toBe(409)
    expect(remove.body.error.code).toBe('CONFLICT')
  })
})

describe('Phase 4 — daily compile endpoint and weekly regression', () => {
  it("4.1 POST /compile aggregates the caller's week for one project", async () => {
    const collections = setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    const viaWeekStart = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT_ID, weekStart: MONDAY })
    )
    expect(viaWeekStart.status).toBe(200)
    expect(viaWeekStart.body.timesheet.userId).toBe(EMPLOYEE_A)
    expect(viaWeekStart.body.timesheet.weekStart).toBe(MONDAY)
    // Only ENTRY_A is on PROJECT_ID in that week (ENTRY_OTHER_PROJECT is Beta).
    expect(viaWeekStart.body.timesheet.totalHours).toBe(8)

    const linked = collections[COLLECTIONS.DAILY_TIMESHEETS].items.find((e: any) => e._id.toString() === ENTRY_A)
    expect(linked.weeklyTimesheetId.toString()).toBe(viaWeekStart.body.timesheet.id)

    // `date` is accepted as a convenience: the containing week is derived.
    const viaDate = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT_2, date: TUESDAY })
    )
    expect(viaDate.status).toBe(200)
    expect(viaDate.body.timesheet.weekStart).toBe(MONDAY)
    expect(viaDate.body.timesheet.totalHours).toBe(4)

    // Compiling someone else's week is not an employee action.
    const foreign = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT_ID, weekStart: MONDAY, userId: EMPLOYEE_B })
    )
    expect(foreign.status).toBe(403)

    // ...and the week selector is mandatory.
    const missingWeek = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT_ID })
    )
    expect(missingWeek.status).toBe(400)
  })

  it("4.1 a supervisor may compile a direct report's week; an admin may compile anyone's", async () => {
    setupDb()
    const app = createApp()

    signIn(SUPERVISOR_ID, 'user', true)
    const supervised = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT_ID, weekStart: MONDAY, userId: EMPLOYEE_B })
    )
    expect(supervised.status).toBe(200)
    expect(supervised.body.timesheet.userId).toBe(EMPLOYEE_B)

    const unrelated = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT_ID, weekStart: MONDAY, userId: OUTSIDER_ID })
    )
    expect(unrelated.status).toBe(403)

    signIn(ADMIN_ID, 'admin', false)
    const asAdmin = await authed(
      request(app).post('/api/v1/timesheets/daily/compile').send({ projectId: PROJECT_ID, weekStart: MONDAY, userId: EMPLOYEE_B })
    )
    expect(asAdmin.status).toBe(200)
  })

  it('regression: the weekly /api/v1/timesheets routes still work', async () => {
    setupDb()
    const app = createApp()

    signIn(EMPLOYEE_B, 'user', false)
    const list = await authed(request(app).get('/api/v1/timesheets'))
    expect(list.status).toBe(200)
    expect(list.body.timesheets.map((t: any) => t.id)).toEqual([WEEKLY_B])

    // The weekly `/:id` guard is untouched — a foreign weekly timesheet is 403,
    // proving `/daily` was handled by the daily router, not the weekly one.
    signIn(EMPLOYEE_A, 'user', false)
    const foreign = await authed(request(app).get(`/api/v1/timesheets/${WEEKLY_B}`))
    expect(foreign.status).toBe(403)
  })
})
