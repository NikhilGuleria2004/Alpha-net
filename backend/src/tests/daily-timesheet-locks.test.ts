import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
// @ts-expect-error — supertest ships without types here; same pattern as auth.test.ts
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { verifyAccessToken } from '../lib/jwt.js'
import { COLLECTIONS } from '../lib/collections.js'
import { invalidateUserCache } from '../middleware/auth.js'
import { getDayOfWeekFromDateString } from '../schemas/daily-timesheet.schema.js'
import { createDailyEntry, updateDailyEntry, deleteDailyEntry } from '../services/daily-timesheet.service.js'
import {
  CASCADE_LOCK_MESSAGE,
  deleteDailyEntryIfUnlocked,
  isFrozenWeeklyTimesheet,
  lockDailyEntriesForWeeklyTimesheet,
  resolveDailyEntryLockState,
  unlockDailyEntriesForWeeklyTimesheet,
  updateDailyEntryIfUnlocked,
} from '../services/daily-timesheet-lock.service.js'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')

// ts.md Phase 5 — Lock Cascading & Race-Condition Protections.
//
// The first block drives the REAL HTTP surface (routing, auth, access guards,
// Zod, controller error mapping, submit/approve/decline/withdraw and the
// auto-compile hook) against a small in-memory Mongo, and walks the whole
// cascade: draft → editable, submitted → frozen, declined/withdrawn → released,
// approved → locked for good.
//
// The second block targets the cascade primitives directly, where the
// race-condition behaviour lives: the lock-aware writes (`*IfUnlocked`) must
// refuse a row that a concurrent submit/approve locked between the caller's read
// and its write, and a stale cascade flag must be repaired rather than
// dead-ending the owner.

const ADMIN_ID = '507f1f77bcf86cd7994390d4'
const SUPERVISOR_ID = '507f1f77bcf86cd7994390c3'
const EMPLOYEE_A = '507f1f77bcf86cd7994390a1'
const EMPLOYEE_B = '507f1f77bcf86cd7994390b2'
const OUTSIDER_ID = '507f1f77bcf86cd7994390e5'

const PROJECT_ID = '507f1f77bcf86cd7994390f6'
const WEEK_DRAFT = '507f1f77bcf86cd799439130'
const WEEK_PENDING = '507f1f77bcf86cd799439131'
const WEEK_OTHER = '507f1f77bcf86cd799439132'
const ENTRY_LINKED = '507f1f77bcf86cd799439140'
const ENTRY_LINKED_LOCKED = '507f1f77bcf86cd799439141'
const ENTRY_FROZEN = '507f1f77bcf86cd799439142'
const ENTRY_UNLINKED_LOCKED = '507f1f77bcf86cd799439143'
const ENTRY_OTHER_WEEK = '507f1f77bcf86cd799439144'
const ENTRY_HARD_LOCK = '507f1f77bcf86cd799439145'

const MONDAY = '2026-09-28' // Monday — the weekStart every flow compiles into
const TUESDAY = '2026-09-29'
const FRIDAY = '2026-10-02'

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
        return (av > bv ? 1 : -1) * (direction < 0 ? -1 : 1)
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
    // Mirrors Mongo's `updateMany` contract closely enough for the cascade:
    // every matched row is updated and the matched count is returned.
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
    // Like Mongo, a wrong `status` inside the filter means "nothing to delete".
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

/** A weekly timesheet (parent) in whichever review state a test needs. */
function weeklyDoc(
  id: string,
  userId: string,
  weekStart: string,
  status: string,
  opts: { isLocked?: boolean; projectId?: string; totalHours?: number } = {},
): Doc {
  const timestamp = new Date(`${weekStart}T00:00:00.000Z`)
  return {
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
    projectId: new ObjectId(opts.projectId ?? PROJECT_ID),
    weekStart,
    entries: [],
    notes: '',
    regularHours: opts.totalHours ?? 0,
    overtimeHours: 0,
    totalHours: opts.totalHours ?? 0,
    status,
    ...(opts.isLocked ? { isLocked: true, lockedAt: timestamp } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/** A daily entry (child). `weeklyTimesheetId` is the Phase 3 compile link. */
function dailyDoc(
  id: string,
  userId: string,
  date: string,
  hours: number,
  opts: {
    entryType?: 'regular' | 'overtime'
    status?: 'draft' | 'locked'
    description?: string
    projectId?: string
    weeklyTimesheetId?: string
  } = {},
): Doc {
  const timestamp = new Date(`${date}T08:00:00.000Z`)
  return {
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
    projectId: new ObjectId(opts.projectId ?? PROJECT_ID),
    ...(opts.weeklyTimesheetId ? { weeklyTimesheetId: new ObjectId(opts.weeklyTimesheetId) } : {}),
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

/** Seeds users/projects plus whatever a test declares, and returns the map. */
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
    ],
    [COLLECTIONS.DAILY_TIMESHEETS]: [],
    [COLLECTIONS.TIMESHEETS]: [],
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

/** Logs a regular day for EMPLOYEE_A through the real daily route. */
function logDay(app: any, date: string, hours: number, description = 'Worked the board') {
  return authed(
    request(app)
      .post('/api/v1/timesheets/daily')
      .send({ projectId: PROJECT_ID, date, hours, entryType: 'regular', description }),
  )
}

/** The single weekly parent the auto-compile hook created for EMPLOYEE_A. */
function weeklyParent(collections: Record<string, any>, index = 0): Doc {
  return collections[COLLECTIONS.TIMESHEETS].items[index]
}

/** Current rows of a collection (re-read: the harness replaces documents on $set). */
function rows(collections: Record<string, any>, name: string): Doc[] {
  return collections[name].items
}

/** Current `status` of a daily entry by id. */
function entryStatus(collections: Record<string, any>, entryId: string): string {
  return rows(collections, COLLECTIONS.DAILY_TIMESHEETS).find((d) => d._id.toString() === entryId)!
    .status
}

/** Current `hours` of a daily entry by id. */
function entryHours(collections: Record<string, any>, entryId: string): number {
  return rows(collections, COLLECTIONS.DAILY_TIMESHEETS).find((d) => d._id.toString() === entryId)!
    .hours
}

describe('Phase 5 — lock cascade over HTTP (/api/v1)', () => {
  it('5.1 a draft week keeps its days editable and re-compiles in place', async () => {
    const collections = setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    const mon = await logDay(app, MONDAY, 8, 'Compiled the matrix')
    const tue = await logDay(app, TUESDAY, 4, 'Paired on the logger')
    expect(mon.status).toBe(201)
    expect(tue.status).toBe(201)

    // The Phase 3 auto-compile hook created one draft parent for the week...
    expect(rows(collections, COLLECTIONS.TIMESHEETS)).toHaveLength(1)
    const parentId = weeklyParent(collections)._id.toString()
    expect(weeklyParent(collections).status).toBe('draft')
    expect(weeklyParent(collections).totalHours).toBe(12)

    // ...and both days are linked to it, still editable.
    const days = rows(collections, COLLECTIONS.DAILY_TIMESHEETS)
    expect(days).toHaveLength(2)
    for (const day of days) {
      expect(day.weeklyTimesheetId.toString()).toBe(parentId)
      expect(day.status).toBe('draft')
    }

    const patch = await authed(
      request(app)
        .patch(`/api/v1/timesheets/daily/${tue.body.dailyTimesheet.id}`)
        .send({ hours: 6, description: 'Extended pairing' }),
    )
    expect(patch.status).toBe(200)
    expect(patch.body.dailyTimesheet.hours).toBe(6)
    // The parent tracks the child while it is still a draft.
    expect(weeklyParent(collections).totalHours).toBe(14)
  })

  it('5.1 a submitted week freezes every day it compiled', async () => {
    const collections = setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    const mon = await logDay(app, MONDAY, 8)
    const tue = await logDay(app, TUESDAY, 4)
    const monId = mon.body.dailyTimesheet.id as string
    const tueId = tue.body.dailyTimesheet.id as string
    const parentId = weeklyParent(collections)._id.toString()

    const submit = await authed(request(app).post(`/api/v1/timesheets/${parentId}/submit`))
    expect(submit.status).toBe(200)
    expect(submit.body.timesheet.status).toBe('pending')

    // Submitting cascades the freeze onto the compiled days...
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS).map((d) => d.status)).toEqual([
      'locked',
      'locked',
    ])

    // ...and the parent status is what rejects a write that somehow still gets through.
    const patch = await authed(
      request(app).patch(`/api/v1/timesheets/daily/${tueId}`).send({ hours: 2 }),
    )
    expect(patch.status).toBe(409)
    expect(patch.body.error.code).toBe('CONFLICT')
    expect(patch.body.error.message).toBe(CASCADE_LOCK_MESSAGE)
    expect(entryHours(collections, tueId)).toBe(4)

    const remove = await authed(request(app).delete(`/api/v1/timesheets/daily/${monId}`))
    expect(remove.status).toBe(409)
    expect(remove.body.error.code).toBe('CONFLICT')
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS)).toHaveLength(2)

    // A brand-new day in a week that is already under review is refused too.
    const late = await logDay(app, FRIDAY, 3)
    expect(late.status).toBe(409)
    expect(late.body.error.message).toBe(CASCADE_LOCK_MESSAGE)
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS)).toHaveLength(2)

    // Read access is untouched — owner and supervisor can still inspect the week.
    const readOwn = await authed(request(app).get(`/api/v1/timesheets/daily/${tueId}`))
    expect(readOwn.status).toBe(200)
    signIn(SUPERVISOR_ID, 'user', true)
    const readSupervised = await authed(request(app).get(`/api/v1/timesheets/daily/${tueId}`))
    expect(readSupervised.status).toBe(200)
  })

  it('5.3 a declined week hands its days back for correction', async () => {
    const collections = setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    await logDay(app, MONDAY, 8)
    const tue = await logDay(app, TUESDAY, 4)
    const tueId = tue.body.dailyTimesheet.id as string
    const parentId = weeklyParent(collections)._id.toString()
    await authed(request(app).post(`/api/v1/timesheets/${parentId}/submit`))
    expect(entryStatus(collections, tueId)).toBe('locked')

    signIn(SUPERVISOR_ID, 'user', true)
    const decline = await authed(
      request(app)
        .post(`/api/v1/approvals/${parentId}/decline`)
        .send({ reason: 'Tuesday looks like 6h' }),
    )
    expect(decline.status).toBe(200)
    expect(decline.body.timesheet.status).toBe('declined')

    // 5.3 — the children are editable again...
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS).map((d) => d.status)).toEqual([
      'draft',
      'draft',
    ])

    // ...and the employee can correct them without an admin.
    signIn(EMPLOYEE_A, 'user', false)
    const patch = await authed(
      request(app)
        .patch(`/api/v1/timesheets/daily/${tueId}`)
        .send({ hours: 6, description: 'Corrected Tuesday' }),
    )
    expect(patch.status).toBe(200)
    expect(patch.body.dailyTimesheet.hours).toBe(6)

    // The corrected hours land on the SAME declined parent (no fork), ready to re-submit.
    expect(rows(collections, COLLECTIONS.TIMESHEETS)).toHaveLength(1)
    expect(weeklyParent(collections).status).toBe('declined')
    expect(weeklyParent(collections).totalHours).toBe(14)

    const resubmit = await authed(request(app).post(`/api/v1/timesheets/${parentId}/submit`))
    expect(resubmit.status).toBe(200)
    expect(resubmit.body.timesheet.status).toBe('pending')
    expect(entryStatus(collections, tueId)).toBe('locked')
  })

  it('5.4 withdrawing a pending week releases its days', async () => {
    const collections = setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    const mon = await logDay(app, MONDAY, 8)
    const monId = mon.body.dailyTimesheet.id as string
    const parentId = weeklyParent(collections)._id.toString()
    await authed(request(app).post(`/api/v1/timesheets/${parentId}/submit`))
    expect(entryStatus(collections, monId)).toBe('locked')

    // Recalling the week returns the day to its owner.
    const withdraw = await authed(
      request(app)
        .post(`/api/v1/timesheets/${parentId}/withdraw`)
        .send({ reason: 'Forgot Friday' }),
    )
    expect(withdraw.status).toBe(200)
    expect(withdraw.body.timesheet.status).toBe('withdrawn')
    expect(entryStatus(collections, monId)).toBe('draft')

    const patch = await authed(
      request(app).patch(`/api/v1/timesheets/daily/${monId}`).send({ hours: 7 }),
    )
    expect(patch.status).toBe(200)
    expect(patch.body.dailyTimesheet.hours).toBe(7)
    expect(weeklyParent(collections).totalHours).toBe(7)
  })

  it('5.2 an approved week is locked for good — even for an admin', async () => {
    const collections = setupDb()
    signIn(EMPLOYEE_A, 'user', false)
    const app = createApp()

    const mon = await logDay(app, MONDAY, 8)
    const tue = await logDay(app, TUESDAY, 4)
    const monId = mon.body.dailyTimesheet.id as string
    const tueId = tue.body.dailyTimesheet.id as string
    const parentId = weeklyParent(collections)._id.toString()
    await authed(request(app).post(`/api/v1/timesheets/${parentId}/submit`))

    signIn(SUPERVISOR_ID, 'user', true)
    const approve = await authed(request(app).post(`/api/v1/approvals/${parentId}/approve`))
    expect(approve.status).toBe(200)
    expect(approve.body.timesheet.status).toBe('approved')

    // 5.2 — approval locks the week and every compiled day with it.
    expect(weeklyParent(collections).isLocked).toBe(true)
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS).every((d) => d.status === 'locked')).toBe(
      true,
    )
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS)).toHaveLength(2)

    signIn(EMPLOYEE_A, 'user', false)
    const ownPatch = await authed(
      request(app).patch(`/api/v1/timesheets/daily/${monId}`).send({ hours: 2 }),
    )
    expect(ownPatch.status).toBe(409)
    expect(ownPatch.body.error.message).toBe(CASCADE_LOCK_MESSAGE)

    // The admin override stops at the cascade: an approved week is immutable.
    signIn(ADMIN_ID, 'admin', false)
    const adminPatch = await authed(
      request(app).patch(`/api/v1/timesheets/daily/${tueId}`).send({ hours: 2 }),
    )
    expect(adminPatch.status).toBe(409)
    expect(adminPatch.body.error.code).toBe('CONFLICT')
    const adminDelete = await authed(request(app).delete(`/api/v1/timesheets/daily/${tueId}`))
    expect(adminDelete.status).toBe(409)
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS)).toHaveLength(2)
  })
})

/** A daily row by id (re-read: the harness replaces documents on $set). */
function entryById(collections: Record<string, any>, entryId: string): Doc {
  return rows(collections, COLLECTIONS.DAILY_TIMESHEETS).find((d) => d._id.toString() === entryId)!
}

describe('Phase 5 — cascade primitives (frozen parents, stale flags, races)', () => {
  it('5.1 the parent weekly timesheet decides the lock state', async () => {
    const collections = setupDb({
      [COLLECTIONS.TIMESHEETS]: [
        // A (user, project, week) key resolves to exactly one weekly row, so the
        // three fixtures below each own a different key.
        weeklyDoc(WEEK_DRAFT, EMPLOYEE_A, MONDAY, 'draft'),
        weeklyDoc(WEEK_PENDING, EMPLOYEE_B, MONDAY, 'pending'),
        weeklyDoc(WEEK_OTHER, EMPLOYEE_A, '2026-10-05', 'approved', { isLocked: true }),
      ],
      [COLLECTIONS.DAILY_TIMESHEETS]: [
        // Linked to an editable week → writable.
        dailyDoc(ENTRY_LINKED, EMPLOYEE_A, MONDAY, 8, { weeklyTimesheetId: WEEK_DRAFT }),
        // Linked, but still flagged `locked` after the week was released → stale flag.
        dailyDoc(ENTRY_LINKED_LOCKED, EMPLOYEE_A, TUESDAY, 4, {
          weeklyTimesheetId: WEEK_DRAFT,
          status: 'locked',
        }),
        // Linked to a submitted week → frozen.
        dailyDoc(ENTRY_FROZEN, EMPLOYEE_B, TUESDAY, 8, { weeklyTimesheetId: WEEK_PENDING }),
        // Not linked at all, inside a submitted week → frozen (week-level lookup).
        dailyDoc(ENTRY_UNLINKED_LOCKED, EMPLOYEE_B, FRIDAY, 4, { status: 'locked' }),
        // Locked with no parent to appeal to → the hard lock the Phase 4 tests pin.
        dailyDoc(ENTRY_HARD_LOCK, OUTSIDER_ID, MONDAY, 8, { status: 'locked' }),
        // Linked to an approved (locked) week → frozen.
        dailyDoc(ENTRY_OTHER_WEEK, EMPLOYEE_A, '2026-10-05', 8, { weeklyTimesheetId: WEEK_OTHER }),
      ],
    })

    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_LINKED))).toBe('mutable')
    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_LINKED_LOCKED))).toBe(
      'reopen-stale-lock',
    )
    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_FROZEN))).toBe('frozen')
    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_UNLINKED_LOCKED))).toBe(
      'frozen',
    )
    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_HARD_LOCK))).toBe('locked')
    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_OTHER_WEEK))).toBe('frozen')

    // The pure predicate the decision is built on.
    expect(isFrozenWeeklyTimesheet(null)).toBe(false)
    expect(isFrozenWeeklyTimesheet({ status: 'draft' })).toBe(false)
    expect(isFrozenWeeklyTimesheet({ status: 'declined' })).toBe(false)
    expect(isFrozenWeeklyTimesheet({ status: 'withdrawn' })).toBe(false)
    expect(isFrozenWeeklyTimesheet({ status: 'pending' })).toBe(true)
    expect(isFrozenWeeklyTimesheet({ status: 'approved' })).toBe(true)
    expect(isFrozenWeeklyTimesheet({ status: 'draft', isLocked: true })).toBe(true)
  })

  it('a write that loses the race with the cascade is a no-op, not a lost update', async () => {
    const collections = setupDb({
      [COLLECTIONS.TIMESHEETS]: [weeklyDoc(WEEK_DRAFT, EMPLOYEE_A, MONDAY, 'draft')],
      [COLLECTIONS.DAILY_TIMESHEETS]: [
        dailyDoc(ENTRY_LINKED, EMPLOYEE_A, MONDAY, 8, { weeklyTimesheetId: WEEK_DRAFT }),
      ],
    })

    // The caller read the row while the week was still editable...
    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_LINKED))).toBe('mutable')

    // ...and a submit/approve cascade locked it before the write could land.
    expect(await lockDailyEntriesForWeeklyTimesheet(WEEK_DRAFT)).toBe(1)
    expect(entryStatus(collections, ENTRY_LINKED)).toBe('locked')

    // The conditional writes refuse to touch a row that no longer reads 'draft'.
    expect(await updateDailyEntryIfUnlocked(ENTRY_LINKED, { hours: 5 }, false)).toBeNull()
    expect(await deleteDailyEntryIfUnlocked(ENTRY_LINKED, false)).toBe(false)
    expect(entryHours(collections, ENTRY_LINKED)).toBe(8)

    // Release the week again: the same primitives write normally.
    expect(await unlockDailyEntriesForWeeklyTimesheet(WEEK_DRAFT)).toBe(1)
    const updated = await updateDailyEntryIfUnlocked(ENTRY_LINKED, { hours: 5 }, false)
    expect(updated.status).toBe('draft')
    expect(entryHours(collections, ENTRY_LINKED)).toBe(5)
    expect(await deleteDailyEntryIfUnlocked(ENTRY_LINKED, false)).toBe(true)
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS)).toHaveLength(0)
  })

  it('a stale cascade flag is repaired when the week is editable again', async () => {
    const collections = setupDb({
      [COLLECTIONS.TIMESHEETS]: [weeklyDoc(WEEK_DRAFT, EMPLOYEE_A, MONDAY, 'declined')],
      [COLLECTIONS.DAILY_TIMESHEETS]: [
        dailyDoc(ENTRY_LINKED_LOCKED, EMPLOYEE_A, MONDAY, 8, {
          weeklyTimesheetId: WEEK_DRAFT,
          status: 'locked',
        }),
      ],
    })

    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_LINKED_LOCKED))).toBe(
      'reopen-stale-lock',
    )

    // The owner's correction succeeds AND clears the flag for the next writer.
    const updated = await updateDailyEntry(ENTRY_LINKED_LOCKED, EMPLOYEE_A, { hours: 6 })
    expect(updated.hours).toBe(6)
    expect(entryStatus(collections, ENTRY_LINKED_LOCKED)).toBe('draft')

    // The upsert path heals the same way (a repeated POST for that day).
    expect(await lockDailyEntriesForWeeklyTimesheet(WEEK_DRAFT)).toBe(1)
    expect(entryStatus(collections, ENTRY_LINKED_LOCKED)).toBe('locked')
    const upserted = await createDailyEntry(EMPLOYEE_A, {
      projectId: PROJECT_ID,
      date: MONDAY,
      hours: 7,
      entryType: 'regular',
      description: 'Reposted after the decline',
    })
    expect(upserted.hours).toBe(7)
    expect(entryStatus(collections, ENTRY_LINKED_LOCKED)).toBe('draft')
  })

  it('a day locked directly (no parent to appeal to) stays locked', async () => {
    const collections = setupDb({
      [COLLECTIONS.DAILY_TIMESHEETS]: [
        dailyDoc(ENTRY_UNLINKED_LOCKED, EMPLOYEE_A, MONDAY, 8, { status: 'locked' }),
      ],
    })

    expect(await resolveDailyEntryLockState(entryById(collections, ENTRY_UNLINKED_LOCKED))).toBe(
      'locked',
    )
    await expect(updateDailyEntry(ENTRY_UNLINKED_LOCKED, EMPLOYEE_A, { hours: 4 })).rejects.toThrow(
      'Cannot modify a locked daily timesheet entry',
    )
    await expect(deleteDailyEntry(ENTRY_UNLINKED_LOCKED, EMPLOYEE_A)).rejects.toThrow(
      'Cannot delete a locked daily timesheet entry',
    )
    expect(entryHours(collections, ENTRY_UNLINKED_LOCKED)).toBe(8)
  })

  it('a day cannot be slipped into a submitted week, even unlinked', async () => {
    const collections = setupDb({
      [COLLECTIONS.TIMESHEETS]: [weeklyDoc(WEEK_PENDING, EMPLOYEE_A, MONDAY, 'pending')],
      [COLLECTIONS.DAILY_TIMESHEETS]: [
        // Linked to the pending week but dated in the NEXT week (drift): the
        // week-level lookup sees nothing for that date, so only the upsert
        // path's own guard can stop the edit.
        dailyDoc(ENTRY_FROZEN, EMPLOYEE_A, '2026-10-05', 8, { weeklyTimesheetId: WEEK_PENDING }),
      ],
    })

    // A brand-new day inside the submitted week is refused before any row is written.
    await expect(
      createDailyEntry(EMPLOYEE_A, {
        projectId: PROJECT_ID,
        date: FRIDAY,
        hours: 3,
        entryType: 'regular',
        description: 'Late Friday work',
      }),
    ).rejects.toThrow(CASCADE_LOCK_MESSAGE)
    expect(rows(collections, COLLECTIONS.DAILY_TIMESHEETS)).toHaveLength(1)

    // Re-posting the drifted day (the upsert path) is refused as well.
    await expect(
      createDailyEntry(EMPLOYEE_A, {
        projectId: PROJECT_ID,
        date: '2026-10-05',
        hours: 6,
        entryType: 'regular',
        description: 'Rework Monday',
      }),
    ).rejects.toThrow(CASCADE_LOCK_MESSAGE)
    expect(entryHours(collections, ENTRY_FROZEN)).toBe(8)
    expect(entryStatus(collections, ENTRY_FROZEN)).toBe('draft')
  })

  it('the cascade touches only the week it was given, and is idempotent', async () => {
    const collections = setupDb({
      [COLLECTIONS.TIMESHEETS]: [
        weeklyDoc(WEEK_DRAFT, EMPLOYEE_A, MONDAY, 'draft'),
        weeklyDoc(WEEK_OTHER, EMPLOYEE_A, '2026-10-05', 'draft'),
      ],
      [COLLECTIONS.DAILY_TIMESHEETS]: [
        dailyDoc(ENTRY_LINKED, EMPLOYEE_A, MONDAY, 8, { weeklyTimesheetId: WEEK_DRAFT }),
        dailyDoc(ENTRY_LINKED_LOCKED, EMPLOYEE_A, TUESDAY, 4, { weeklyTimesheetId: WEEK_DRAFT }),
        dailyDoc(ENTRY_OTHER_WEEK, EMPLOYEE_A, '2026-10-05', 8, { weeklyTimesheetId: WEEK_OTHER }),
      ],
    })

    expect(await lockDailyEntriesForWeeklyTimesheet(WEEK_DRAFT)).toBe(2)
    expect(entryStatus(collections, ENTRY_LINKED)).toBe('locked')
    expect(entryStatus(collections, ENTRY_LINKED_LOCKED)).toBe('locked')
    // The other week is untouched.
    expect(entryStatus(collections, ENTRY_OTHER_WEEK)).toBe('draft')

    // A retried cascade (approve following submit) changes nothing.
    await lockDailyEntriesForWeeklyTimesheet(WEEK_DRAFT)
    expect(entryStatus(collections, ENTRY_LINKED)).toBe('locked')

    expect(await unlockDailyEntriesForWeeklyTimesheet(WEEK_DRAFT)).toBe(2)
    expect(
      rows(collections, COLLECTIONS.DAILY_TIMESHEETS).filter((d) => d.status === 'draft'),
    ).toHaveLength(3)

    // Week-less / unknown parents are no-ops.
    expect(await lockDailyEntriesForWeeklyTimesheet(undefined)).toBe(0)
    expect(await lockDailyEntriesForWeeklyTimesheet('507f1f77bcf86cd799439199')).toBe(0)
    expect(await unlockDailyEntriesForWeeklyTimesheet('507f1f77bcf86cd799439199')).toBe(0)
  })
})
