// Flow Integration Phase 4 tests (checklist Phase 4). Mocked getDb — no live Mongo.
// Covers: schema (4.1), additive keys (4.2), create auto-attach/validation (4.3),
// locked guards + immutable assignment (4.4), atomic approve lock (4.5),
// weekly-draft attach (4.6), the assignmentId index (4.7), the list filter (4.8),
// the idempotent backfill (4.9) and the legacy regression surface (4.11).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js', () => ({ getDb: vi.fn() }))
vi.mock('../services/activity.service.js', () => ({ createActivity: vi.fn() }))
vi.mock('../services/notification.service.js', () => ({ createNotification: vi.fn() }))

import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { createTimesheetSchema, updateTimesheetSchema } from '../schemas/timesheet.schema.js'
import { timesheetFlowKeys, type TimesheetEntry } from '../services/timesheet.service.js'

const USER_ID = new ObjectId('507f1f77bcf86cd799439021')
const OTHER_USER_ID = new ObjectId('507f1f77bcf86cd799439022')
const PROJECT_ID = new ObjectId('507f1f77bcf86cd799439031')
const OTHER_PROJECT_ID = new ObjectId('507f1f77bcf86cd799439032')
const ASSIGNMENT_ID = new ObjectId('507f1f77bcf86cd799439061')
const OTHER_ASSIGNMENT_ID = new ObjectId('507f1f77bcf86cd799439062')
const LOCKED_TS_ID = new ObjectId('507f1f77bcf86cd799439011')
const OTHER_TS_ID = new ObjectId('507f1f77bcf86cd799439012')
const UNLOCKED_TS_ID = new ObjectId('507f1f77bcf86cd799439013')
const ADMIN_ID = new ObjectId('507f1f77bcf86cd799439071')

// --- minimal in-memory collection double (mirrors Phase 3's helper) ---------
function fieldMatches(actual: any, expected: any): boolean {
  if (expected instanceof ObjectId) return actual?.toString() === expected.toString()
  if (expected === null) return actual === null || actual === undefined
  if (expected && typeof expected === 'object') {
    if ('$exists' in expected) {
      const exists = actual !== undefined && actual !== null
      return expected.$exists ? exists : !exists
    }
    if ('$in' in expected) return (expected.$in as any[]).some((value) => fieldMatches(actual, value))
  }
  return actual === expected
}

function matches(doc: any, query: any): boolean {
  return Object.entries(query ?? {}).every(([key, value]) => {
    if (key === '$or') return (value as any[]).some((sub) => matches(doc, sub))
    return fieldMatches(doc?.[key], value)
  })
}

function collectionWith(seed: any[] = []) {
  const items = [...seed]
  const col: any = {
    items,
    insertOne: vi.fn((doc: any) => {
      const inserted = { _id: new ObjectId(), ...doc }
      items.push(inserted)
      return Promise.resolve({ insertedId: inserted._id })
    }),
    findOne: vi.fn((query: any) => Promise.resolve(items.find((item) => matches(item, query)) ?? null)),
    countDocuments: vi.fn((query: any = {}) => Promise.resolve(items.filter((item) => matches(item, query)).length)),
    find: vi.fn((query: any = {}) => {
      const rows = () => items.filter((item) => matches(item, query))
      const cursor: any = { toArray: vi.fn(() => Promise.resolve(rows())) }
      cursor.sort = vi.fn(() => cursor)
      cursor.limit = vi.fn(() => cursor)
      return cursor
    }),
    findOneAndUpdate: vi.fn((query: any, update: any) => {
      const index = items.findIndex((item) => matches(item, query))
      if (index === -1) return Promise.resolve(null)
      if (update?.$set) items[index] = { ...items[index], ...update.$set }
      return Promise.resolve(items[index])
    }),
    updateOne: vi.fn((query: any, update: any) => {
      const index = items.findIndex((item) => matches(item, query))
      if (index === -1) return Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
      if (update?.$set) items[index] = { ...items[index], ...update.$set }
      return Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    }),
    createIndex: vi.fn().mockResolvedValue('idx'),
  }
  return col
}


function seeded(overrides: Record<string, any> = {}) {
  const collections: Record<string, any> = {
    [COLLECTIONS.USERS]: collectionWith([
      { _id: USER_ID, name: 'Jane Resource', status: 'active', defaultPayRate: 65 },
      { _id: ADMIN_ID, name: 'Ada Admin', role: 'admin', isSupervisor: false, status: 'active' },
    ]),
    [COLLECTIONS.PROJECTS]: collectionWith([projectDoc()]),
    [COLLECTIONS.ASSIGNMENTS]: collectionWith([assignmentDoc()]),
    [COLLECTIONS.TIMESHEETS]: collectionWith([]),
    ...overrides,
  }
  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => collections[name] ?? collectionWith()),
  } as unknown as Awaited<ReturnType<typeof getDb>>)
  return collections
}

function projectDoc(overrides: Record<string, any> = {}) {
  return {
    _id: PROJECT_ID,
    name: 'Sony Migration',
    client: 'Sony',
    status: 'active',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    hourlyRate: 120,
    teamMemberIds: [USER_ID],
    ...overrides,
  }
}

function assignmentDoc(overrides: Record<string, any> = {}) {
  return {
    _id: ASSIGNMENT_ID,
    resourceId: USER_ID,
    projectId: PROJECT_ID,
    clientId: new ObjectId(),
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    billRate: 120,
    payRate: 65,
    billingType: 'hourly',
    timesheetRequired: true,
    approvalRequired: true,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function timesheetDoc(overrides: Record<string, any> = {}) {
  return {
    _id: LOCKED_TS_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    weekStart: '2026-01-05',
    entries: [],
    notes: '',
    regularHours: 0,
    overtimeHours: 0,
    totalHours: 0,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function validEntries(): TimesheetEntry[] {
  return [
    {
      id: 'e1',
      description: 'Regular work',
      entryType: 'regular',
      hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
    },
  ]
}

function validWeek(overrides: Record<string, any> = {}) {
  return { projectId: PROJECT_ID.toString(), weekStart: '2026-01-12', entries: validEntries(), notes: '', ...overrides }
}

describe('Phase 4 — schema (4.1)', () => {
  it('parses a legacy payload unchanged (no assignment keys required)', () => {
    const parsed: any = createTimesheetSchema.parse({ projectId: 'p1', weekStart: '2026-01-12', entries: validEntries() })
    expect(parsed.projectId).toBe('p1')
    expect(parsed).not.toHaveProperty('assignmentId')
    expect(parsed).not.toHaveProperty('adjustmentOf')
  })

  it('accepts the new optional keys and allows projectId to be inferred', () => {
    const parsed: any = createTimesheetSchema.parse({
      weekStart: '2026-01-12',
      entries: validEntries(),
      assignmentId: ASSIGNMENT_ID.toString(),
      adjustmentOf: LOCKED_TS_ID.toString(),
    })
    expect(parsed.assignmentId).toBe(ASSIGNMENT_ID.toString())
    expect(parsed.adjustmentOf).toBe(LOCKED_TS_ID.toString())
    expect(() => createTimesheetSchema.parse({ weekStart: '2026-01-12', entries: validEntries(), assignmentId: '' })).toThrow()
  })

  it('accepts assignmentId on update (immutability is enforced in the service)', () => {
    const parsed: any = updateTimesheetSchema.parse({ assignmentId: ASSIGNMENT_ID.toString() })
    expect(parsed.assignmentId).toBe(ASSIGNMENT_ID.toString())
  })
})

describe('Phase 4 — additive response keys (4.2)', () => {
  it('returns undefined for legacy docs, so old responses are unchanged', () => {
    expect(timesheetFlowKeys({})).toEqual({
      assignmentId: undefined,
      isLocked: undefined,
      lockedAt: undefined,
      adjustmentOf: undefined,
    })
  })

  it('maps assignmentId/lockedAt/adjustmentOf and ISO-stringifies the lock time', () => {
    const lockedAt = new Date('2026-02-01T10:00:00.000Z')
    expect(
      timesheetFlowKeys({ assignmentId: ASSIGNMENT_ID, isLocked: true, lockedAt, adjustmentOf: LOCKED_TS_ID }),
    ).toEqual({
      assignmentId: ASSIGNMENT_ID.toString(),
      isLocked: true,
      lockedAt: '2026-02-01T10:00:00.000Z',
      adjustmentOf: LOCKED_TS_ID.toString(),
    })
  })
})

describe('Phase 4 — createTimesheet links an assignment (4.3)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('auto-attaches the active assignment when the client omits assignmentId', async () => {
    const collections = seeded()
    const { createTimesheet } = await import('../services/timesheet.service.js')

    const created = await createTimesheet(validWeek(), USER_ID.toString())

    expect(created.assignmentId).toBe(ASSIGNMENT_ID.toString())
    expect(collections[COLLECTIONS.TIMESHEETS].items[0].assignmentId.toString()).toBe(ASSIGNMENT_ID.toString())
  })

  it('never rejects when no assignment exists and writes no assignment key at all', async () => {
    const collections = seeded({ [COLLECTIONS.ASSIGNMENTS]: collectionWith([]) })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    const created = await createTimesheet(validWeek(), USER_ID.toString())

    expect(created.assignmentId).toBeUndefined()
    expect(collections[COLLECTIONS.TIMESHEETS].items[0]).not.toHaveProperty('assignmentId')
  })

  it('never rejects when the assignment lookup blows up (best-effort)', async () => {
    const collections = seeded()
    collections[COLLECTIONS.ASSIGNMENTS].find.mockImplementation(() => {
      throw new Error('mongo unavailable')
    })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    const created = await createTimesheet(validWeek(), USER_ID.toString())

    expect(created.id).toBeDefined()
    expect(created.assignmentId).toBeUndefined()
  })

  it('accepts an explicit assignmentId and infers projectId from it', async () => {
    const collections = seeded()
    const { createTimesheet } = await import('../services/timesheet.service.js')

    const created = await createTimesheet(
      { assignmentId: ASSIGNMENT_ID.toString(), weekStart: '2026-01-12', entries: validEntries(), notes: '' },
      USER_ID.toString(),
    )

    expect(created.projectId).toBe(PROJECT_ID.toString())
    expect(created.assignmentId).toBe(ASSIGNMENT_ID.toString())
    expect(collections[COLLECTIONS.TIMESHEETS].items[0].projectId.toString()).toBe(PROJECT_ID.toString())
  })
})


describe('Phase 4 — explicit assignment validation (4.3)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an explicit assignment that does not exist', async () => {
    seeded({ [COLLECTIONS.ASSIGNMENTS]: collectionWith([]) })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      createTimesheet(validWeek({ assignmentId: OTHER_ASSIGNMENT_ID.toString() }), USER_ID.toString()),
    ).rejects.toThrow('Assignment not found')
  })

  it('rejects an assignment belonging to another resource', async () => {
    seeded()
    const { createTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      createTimesheet(validWeek({ assignmentId: ASSIGNMENT_ID.toString() }), OTHER_USER_ID.toString()),
    ).rejects.toThrow('Assignment does not belong to this resource')
  })

  it('rejects an assignment that is not active', async () => {
    seeded({ [COLLECTIONS.ASSIGNMENTS]: collectionWith([assignmentDoc({ status: 'onHold' })]) })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      createTimesheet(validWeek({ assignmentId: ASSIGNMENT_ID.toString() }), USER_ID.toString()),
    ).rejects.toThrow('Assignment is not active')
  })

  it('rejects an assignment from a different project', async () => {
    seeded({ [COLLECTIONS.ASSIGNMENTS]: collectionWith([assignmentDoc({ projectId: OTHER_PROJECT_ID })]) })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      createTimesheet(validWeek({ assignmentId: ASSIGNMENT_ID.toString() }), USER_ID.toString()),
    ).rejects.toThrow('Assignment does not belong to this project')
  })

  it('rejects a week outside the assignment dates', async () => {
    seeded({ [COLLECTIONS.ASSIGNMENTS]: collectionWith([assignmentDoc({ startDate: '2026-06-01', endDate: '2026-06-30' })]) })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      createTimesheet(validWeek({ assignmentId: ASSIGNMENT_ID.toString() }), USER_ID.toString()),
    ).rejects.toThrow('is outside the assignment dates')
  })

  it('still requires a project when neither projectId nor assignmentId is sent', async () => {
    seeded()
    const { createTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      createTimesheet({ weekStart: '2026-01-12', entries: validEntries(), notes: '' }, USER_ID.toString()),
    ).rejects.toThrow('Project ID is required')
  })
})

describe('Phase 4 — adjustmentOf (corrections of locked periods)', () => {
  beforeEach(() => vi.clearAllMocks())

  it("allows an adjustment of the caller's own locked timesheet", async () => {
    seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([timesheetDoc({ status: 'approved', isLocked: true, lockedAt: new Date() })]),
    })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    const created = await createTimesheet(validWeek({ adjustmentOf: LOCKED_TS_ID.toString() }), USER_ID.toString())

    expect(created.adjustmentOf).toBe(LOCKED_TS_ID.toString())
    expect(created.assignmentId).toBe(ASSIGNMENT_ID.toString())
  })

  it('rejects a missing reference (absent or malformed id)', async () => {
    seeded({ [COLLECTIONS.TIMESHEETS]: collectionWith([]) })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      createTimesheet(validWeek({ adjustmentOf: '507f1f77bcf86cd799439999' }), USER_ID.toString()),
    ).rejects.toThrow('Adjustment reference not found')
    await expect(
      createTimesheet(validWeek({ adjustmentOf: 'not-an-object-id' }), USER_ID.toString()),
    ).rejects.toThrow('Adjustment reference not found')
  })

  it("rejects a reference owned by someone else and an unlocked reference", async () => {
    seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([
        timesheetDoc({ _id: OTHER_TS_ID, userId: OTHER_USER_ID, status: 'approved', isLocked: true, lockedAt: new Date() }),
        timesheetDoc({ _id: UNLOCKED_TS_ID, status: 'approved' }),
      ]),
    })
    const { createTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      createTimesheet(validWeek({ adjustmentOf: OTHER_TS_ID.toString() }), USER_ID.toString()),
    ).rejects.toThrow('Adjustment reference must belong to the same resource')
    await expect(
      createTimesheet(validWeek({ adjustmentOf: UNLOCKED_TS_ID.toString() }), USER_ID.toString()),
    ).rejects.toThrow('Adjustment reference must be a locked timesheet')
  })
})

describe('Phase 4 — locked timesheets are immutable (4.4)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('blocks update on a locked timesheet before any other rule', async () => {
    const collections = seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([timesheetDoc({ status: 'approved', isLocked: true, lockedAt: new Date() })]),
    })
    const { updateTimesheet } = await import('../services/timesheet.service.js')

    await expect(
      updateTimesheet(LOCKED_TS_ID.toString(), validWeek(), USER_ID.toString()),
    ).rejects.toThrow('Timesheet is locked')
    expect(collections[COLLECTIONS.TIMESHEETS].findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('blocks submit and withdraw on a locked timesheet', async () => {
    seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([timesheetDoc({ status: 'approved', isLocked: true, lockedAt: new Date() })]),
    })
    const { submitTimesheet, withdrawTimesheet } = await import('../services/timesheet.service.js')

    await expect(submitTimesheet(LOCKED_TS_ID.toString(), USER_ID.toString())).rejects.toThrow('Timesheet is locked')
    await expect(withdrawTimesheet(LOCKED_TS_ID.toString(), USER_ID.toString())).rejects.toThrow('Timesheet is locked')
  })

  it('keeps the legacy behavior for docs without isLocked (still editable)', async () => {
    const collections = seeded({ [COLLECTIONS.TIMESHEETS]: collectionWith([timesheetDoc()]) })
    const { updateTimesheet } = await import('../services/timesheet.service.js')

    const updated = await updateTimesheet(LOCKED_TS_ID.toString(), validWeek({ weekStart: '2026-01-05' }), USER_ID.toString())

    expect(updated).not.toBeNull()
    const set = collections[COLLECTIONS.TIMESHEETS].findOneAndUpdate.mock.calls[0][1].$set
    expect(set).not.toHaveProperty('assignmentId')
  })

  it('rejects changing assignmentId but accepts re-sending the same one', async () => {
    const collections = seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([timesheetDoc({ assignmentId: ASSIGNMENT_ID })]),
    })
    const { updateTimesheet } = await import('../services/timesheet.service.js')
    const sameWeek = { weekStart: '2026-01-05' }

    await expect(
      updateTimesheet(
        LOCKED_TS_ID.toString(),
        validWeek({ ...sameWeek, assignmentId: OTHER_ASSIGNMENT_ID.toString() }),
        USER_ID.toString(),
      ),
    ).rejects.toThrow('Cannot change the assignment of an existing timesheet')

    const updated = await updateTimesheet(
      LOCKED_TS_ID.toString(),
      validWeek({ ...sameWeek, assignmentId: ASSIGNMENT_ID.toString() }),
      USER_ID.toString(),
    )
    expect(updated?.assignmentId).toBe(ASSIGNMENT_ID.toString())
    expect(collections[COLLECTIONS.TIMESHEETS].findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('assignmentId')
  })
})


describe('Phase 4 — approval locks atomically (4.5)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('folds isLocked/lockedAt into the same $set as the approval', async () => {
    const collections = seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([timesheetDoc({ status: 'pending', submittedAt: new Date() })]),
    })
    const { approveTimesheet } = await import('../services/approval.service.js')

    const approved = await approveTimesheet(LOCKED_TS_ID.toString(), ADMIN_ID.toString())

    const writes = collections[COLLECTIONS.TIMESHEETS].findOneAndUpdate.mock.calls
    expect(writes).toHaveLength(1)
    expect(writes[0][1].$set).toMatchObject({ status: 'approved', isLocked: true })
    expect(writes[0][1].$set.lockedAt).toBeInstanceOf(Date)
    expect(collections[COLLECTIONS.TIMESHEETS].updateOne).not.toHaveBeenCalled()

    expect(approved?.status).toBe('approved')
    expect(approved?.isLocked).toBe(true)
    expect(typeof approved?.lockedAt).toBe('string')
    expect(collections[COLLECTIONS.TIMESHEETS].items[0].isLocked).toBe(true)
  })

  it('carries the Phase 4 keys through the approvals queue (legacy rows stay undefined)', async () => {
    const { getApprovals } = await import('../services/approval.service.js')
    seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([
        timesheetDoc({ status: 'pending', assignmentId: ASSIGNMENT_ID, isLocked: false }),
        timesheetDoc({ _id: OTHER_TS_ID, status: 'pending' }),
      ]),
    })

    const queue = await getApprovals()

    const linked = queue.find((t) => t.id === LOCKED_TS_ID.toString())
    const legacy = queue.find((t) => t.id === OTHER_TS_ID.toString())
    expect(linked?.assignmentId).toBe(ASSIGNMENT_ID.toString())
    expect(linked?.isLocked).toBe(false)
    expect(legacy?.assignmentId).toBeUndefined()
    expect(legacy?.isLocked).toBeUndefined()
  })
})

describe('Phase 4 — weekly drafts attach best-effort (4.6)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('adds assignmentId to $setOnInsert when the member has an active assignment', async () => {
    const collections = seeded()
    collections[COLLECTIONS.TIMESHEETS].updateOne.mockResolvedValue({ upsertedCount: 1, upsertedId: new ObjectId() })
    const { createWeeklyDrafts } = await import('../services/timesheet.service.js')

    const result = await createWeeklyDrafts('2026-01-12')

    expect(result.created).toBe(1)
    const insert = collections[COLLECTIONS.TIMESHEETS].updateOne.mock.calls[0][1].$setOnInsert
    expect(insert.assignmentId.toString()).toBe(ASSIGNMENT_ID.toString())
    expect(result.errors).toEqual([])
  })

  it('still seeds the draft when no assignment exists (no assignment key)', async () => {
    const collections = seeded({ [COLLECTIONS.ASSIGNMENTS]: collectionWith([]) })
    collections[COLLECTIONS.TIMESHEETS].updateOne.mockResolvedValue({ upsertedCount: 1, upsertedId: new ObjectId() })
    const { createWeeklyDrafts } = await import('../services/timesheet.service.js')

    const result = await createWeeklyDrafts('2026-01-12')

    expect(result.created).toBe(1)
    expect(collections[COLLECTIONS.TIMESHEETS].updateOne.mock.calls[0][1].$setOnInsert).not.toHaveProperty('assignmentId')
  })
})


describe('Phase 4 — timesheet assignmentId index (4.7)', () => {
  it('ensureIndexes adds a non-unique assignmentId index and keeps the legacy unique guard', async () => {
    const created: string[] = []
    vi.mocked(getDb).mockReset()
    const collections: Record<string, any> = {}
    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn((name: string) => {
        if (!collections[name]) {
          collections[name] = {
            createIndex: vi.fn(async (spec: any, opts?: any) => {
              created.push(`${name}:${JSON.stringify(spec)}:${JSON.stringify(opts ?? {})}`)
              return 'idx'
            }),
          }
        }
        return collections[name]
      }),
    } as unknown as Awaited<ReturnType<typeof getDb>>)

    const { ensureIndexes } = await import('../lib/collections.js')
    await ensureIndexes()

    expect(created).toContain('timesheets:{"assignmentId":1}:{}')
    const uniqueGuard = created.find((entry) => entry.includes('"userId":1,"projectId":1,"weekStart":1'))
    expect(uniqueGuard).toBeDefined()
    expect(uniqueGuard).toContain('"unique":true')
  })
})

describe('Phase 4 — listTimesheets assignmentId filter (4.8)', () => {
  it('narrows by assignmentId and exposes the flow keys on the mapped row', async () => {
    const lockedAt = new Date('2026-02-01T10:00:00.000Z')
    const collections = seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([
        timesheetDoc({ assignmentId: ASSIGNMENT_ID, isLocked: true, lockedAt }),
        timesheetDoc({ _id: OTHER_TS_ID }),
      ]),
    })
    const { getTimesheets } = await import('../services/timesheet.service.js')

    const rows = await getTimesheets({ assignmentId: ASSIGNMENT_ID.toString() })

    expect(collections[COLLECTIONS.TIMESHEETS].find.mock.calls[0][0].assignmentId.toString()).toBe(ASSIGNMENT_ID.toString())
    expect(rows).toHaveLength(1)
    expect(rows[0].assignmentId).toBe(ASSIGNMENT_ID.toString())
    expect(rows[0].isLocked).toBe(true)
    expect(rows[0].lockedAt).toBe('2026-02-01T10:00:00.000Z')

    const all = await getTimesheets()
    expect(all).toHaveLength(2)
    expect(all.find((t) => t.id === OTHER_TS_ID.toString())?.assignmentId).toBeUndefined()
  })
})

describe('Phase 4 — backfill timesheet assignments (4.9)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('links missing rows, skips pairs without an assignment and is idempotent', async () => {
    const orphanSource = timesheetDoc({ _id: OTHER_TS_ID, weekStart: '2026-01-05' })
    const collections = seeded({
      [COLLECTIONS.TIMESHEETS]: collectionWith([
        orphanSource,
        timesheetDoc({ _id: UNLOCKED_TS_ID, projectId: OTHER_PROJECT_ID }),
        timesheetDoc({ _id: LOCKED_TS_ID, assignmentId: ASSIGNMENT_ID }),
      ]),
    })
    const { backfillTimesheetAssignments } = await import('../scripts/backfill-timesheet-assignments.js')

    const first = await backfillTimesheetAssignments()

    expect(first).toMatchObject({
      timesheetsScanned: 3,
      missingLink: 2,
      linked: 1,
      skippedNoAssignment: 1,
      dryRun: false,
    })
    expect(first.errors).toEqual([])
    const patched = collections[COLLECTIONS.TIMESHEETS].items.find(
      (t: any) => t._id.toString() === OTHER_TS_ID.toString(),
    )
    expect(patched.assignmentId.toString()).toBe(ASSIGNMENT_ID.toString())
    // Additive-only: the rest of the document is untouched.
    expect(patched.updatedAt).toEqual(orphanSource.updatedAt)
    expect(patched.totalHours).toBe(0)

    const second = await backfillTimesheetAssignments()
    // Idempotent: nothing new is linked. The orphan (no active assignment) stays
    // missing on purpose — it is skipped and logged, never guessed.
    expect(second.linked).toBe(0)
    expect(second.missingLink).toBe(1)
    expect(second.skippedNoAssignment).toBe(1)
  })

  it('dry-run reports the same counts but writes nothing', async () => {
    const collections = seeded({ [COLLECTIONS.TIMESHEETS]: collectionWith([timesheetDoc({ _id: OTHER_TS_ID })]) })
    const { backfillTimesheetAssignments } = await import('../scripts/backfill-timesheet-assignments.js')

    const report = await backfillTimesheetAssignments({ dryRun: true })

    expect(report).toMatchObject({ missingLink: 1, linked: 1, skippedNoAssignment: 0, dryRun: true })
    expect(collections[COLLECTIONS.TIMESHEETS].items[0]).not.toHaveProperty('assignmentId')
    expect(collections[COLLECTIONS.TIMESHEETS].updateOne).not.toHaveBeenCalled()
  })
})

