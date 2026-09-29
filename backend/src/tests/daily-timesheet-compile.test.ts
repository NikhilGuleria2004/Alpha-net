import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js', () => ({ getDb: vi.fn() }))

import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import {
  createDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
} from '../services/daily-timesheet.service.js'
import {
  compileWeeklyTimesheet,
  calcTotals,
  getTimesheetById,
} from '../services/timesheet.service.js'

const USER_ID = new ObjectId('507f1f77bcf86cd799439021')
const PROJECT_ID = new ObjectId('507f1f77bcf86cd799439031')
const ASSIGNMENT_ID = new ObjectId('507f1f77bcf86cd799439061')

function fieldMatches(actual: any, expected: any): boolean {
  if (expected instanceof ObjectId) return actual?.toString() === expected.toString()
  if (expected === null) return actual === null || actual === undefined
  if (expected && typeof expected === 'object') {
    if ('$ne' in expected) {
      return actual?.toString() !== expected.$ne?.toString()
    }
    if ('$in' in expected && Array.isArray(expected.$in)) {
      return expected.$in.some((candidate: any) => fieldMatches(actual, candidate))
    }
    if ('$gte' in expected || '$lte' in expected) {
      if ('$gte' in expected && actual < expected.$gte) return false
      if ('$lte' in expected && actual > expected.$lte) return false
      return true
    }
  }
  return actual === expected
}

function matches(doc: any, query: any): boolean {
  return Object.entries(query ?? {}).every(([key, value]) => fieldMatches(doc?.[key], value))
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
    updateMany: vi.fn((query: any, update: any) => {
      let count = 0
      for (const item of items) {
        if (matches(item, query)) {
          if (update?.$set) Object.assign(item, update.$set)
          count++
        }
      }
      return Promise.resolve({ matchedCount: count, modifiedCount: count })
    }),
    deleteOne: vi.fn((query: any) => {
      const index = items.findIndex((item) => matches(item, query))
      if (index === -1) return Promise.resolve({ deletedCount: 0 })
      items.splice(index, 1)
      return Promise.resolve({ deletedCount: 1 })
    }),
  }
  return col
}

function setupDb() {
  const collections: Record<string, any> = {
    [COLLECTIONS.PROJECTS]: collectionWith([
      {
        _id: PROJECT_ID,
        name: 'Alpha Project',
        teamMemberIds: [USER_ID],
      },
    ]),
    [COLLECTIONS.ASSIGNMENTS]: collectionWith([
      {
        _id: ASSIGNMENT_ID,
        resourceId: USER_ID,
        projectId: PROJECT_ID,
        status: 'active',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    ]),
    [COLLECTIONS.DAILY_TIMESHEETS]: collectionWith(),
    [COLLECTIONS.TIMESHEETS]: collectionWith(),
  }

  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => collections[name] ?? collectionWith()),
  } as unknown as Awaited<ReturnType<typeof getDb>>)

  return collections
}

describe('Phase 3 — Compilation Engine (daily_timesheets -> timesheets)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('compiles 5 daily entries (Mon-Fri, 8h each) into weekly timesheet', async () => {
    const cols = setupDb()

    // 1. Create Mon-Fri daily entries
    const dates = [
      { date: '2026-09-28', desc: 'Monday task 1' },
      { date: '2026-09-29', desc: 'Tuesday task 2' },
      { date: '2026-09-30', desc: 'Wednesday task 3' },
      { date: '2026-10-01', desc: 'Thursday task 4' },
      { date: '2026-10-02', desc: 'Friday task 5' },
    ]

    for (const d of dates) {
      await createDailyEntry(USER_ID.toString(), {
        projectId: PROJECT_ID.toString(),
        date: d.date,
        hours: 8,
        entryType: 'regular',
        description: d.desc,
      })
    }

    // 2. Compilation should have run automatically via hook or manual call
    const compiled = await compileWeeklyTimesheet(
      USER_ID.toString(),
      PROJECT_ID.toString(),
      '2026-09-28'
    )

    // Assert weekly timesheet attributes
    expect(compiled.regularHours).toBe(40)
    expect(compiled.overtimeHours).toBe(0)
    expect(compiled.totalHours).toBe(40)
    expect(compiled.status).toBe('draft')
    expect(compiled.assignmentId).toBe(ASSIGNMENT_ID.toString())

    // Check entry shape matches legacy calcTotals format
    expect(compiled.entries.length).toBe(1)
    const entry = compiled.entries[0]
    expect(entry.entryType).toBe('regular')
    expect(entry.hours).toEqual({
      mon: 8,
      tue: 8,
      wed: 8,
      thu: 8,
      fri: 8,
      sat: 0,
      sun: 0,
    })
    expect(calcTotals(compiled.entries)).toEqual({
      regularHours: 40,
      overtimeHours: 0,
      totalHours: 40,
    })

    // Assert compiled description format: [Mon] ...; [Tue] ...
    expect(entry.description).toBe(
      '[Mon] Monday task 1; [Tue] Tuesday task 2; [Wed] Wednesday task 3; [Thu] Thursday task 4; [Fri] Friday task 5'
    )

    // Assert all 5 daily records received weeklyTimesheetId
    const dailyItems = cols[COLLECTIONS.DAILY_TIMESHEETS].items
    expect(dailyItems.length).toBe(5)
    for (const item of dailyItems) {
      expect(item.weeklyTimesheetId.toString()).toBe(compiled.id)
    }
  })

  it('modifies Tuesday from 8h to 4h and auto-synchronizes parent to 36 hours', async () => {
    const cols = setupDb()

    const dates = [
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]

    let tuesdayId = ''
    for (const d of dates) {
      const created = await createDailyEntry(USER_ID.toString(), {
        projectId: PROJECT_ID.toString(),
        date: d,
        hours: 8,
        entryType: 'regular',
        description: `Work on ${d}`,
      })
      if (d === '2026-09-29') tuesdayId = created.id
    }

    // Modify Tuesday entry
    await updateDailyEntry(tuesdayId, USER_ID.toString(), {
      hours: 4,
      description: 'Work on Tuesday updated to 4h',
    })

    // Fetch parent timesheet from db
    const timesheetDoc = cols[COLLECTIONS.TIMESHEETS].items[0]
    expect(timesheetDoc).toBeDefined()
    expect(timesheetDoc.regularHours).toBe(36)
    expect(timesheetDoc.totalHours).toBe(36)
    expect(timesheetDoc.entries[0].hours.tue).toBe(4)
    expect(timesheetDoc.entries[0].description).toContain('[Tue] Work on Tuesday updated to 4h')
  })

  it('deletes an entry and auto-synchronizes parent timesheet', async () => {
    const cols = setupDb()

    const mon = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-28',
      hours: 8,
      entryType: 'regular',
      description: 'Monday work',
    })

    const tue = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-29',
      hours: 8,
      entryType: 'regular',
      description: 'Tuesday work',
    })

    let timesheetDoc = cols[COLLECTIONS.TIMESHEETS].items[0]
    expect(timesheetDoc.totalHours).toBe(16)

    // Delete Tuesday
    await deleteDailyEntry(tue.id, USER_ID.toString())

    timesheetDoc = cols[COLLECTIONS.TIMESHEETS].items[0]
    expect(timesheetDoc.totalHours).toBe(8)
    expect(timesheetDoc.entries[0].hours.tue).toBe(0)
    expect(timesheetDoc.entries[0].description).toBe('[Mon] Monday work')
  })

  it('aggregates overtime and regular entries simultaneously', async () => {
    const cols = setupDb()

    // 8h Monday regular
    await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-28',
      hours: 8,
      entryType: 'regular',
      description: 'Weekday regular',
    })

    // 6h Saturday overtime
    await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-10-03',
      hours: 6,
      entryType: 'overtime',
      description: 'Weekend emergency fix',
    })

    const compiled = await compileWeeklyTimesheet(
      USER_ID.toString(),
      PROJECT_ID.toString(),
      '2026-09-28'
    )

    expect(compiled.regularHours).toBe(8)
    expect(compiled.overtimeHours).toBe(6)
    expect(compiled.totalHours).toBe(14)
    expect(compiled.entries.length).toBe(2)

    const regularEntry = compiled.entries.find((e) => e.entryType === 'regular')!
    const overtimeEntry = compiled.entries.find((e) => e.entryType === 'overtime')!

    expect(regularEntry.hours.mon).toBe(8)
    expect(regularEntry.description).toBe('[Mon] Weekday regular')

    expect(overtimeEntry.hours.sat).toBe(6)
    expect(overtimeEntry.description).toBe('[Sat] Weekend emergency fix')
  })
})

