import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js', () => ({ getDb: vi.fn() }))

import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import {
  createDailyEntry,
  updateDailyEntry,
  deleteDailyEntry,
  getDailyEntryById,
  getDailyEntriesForDate,
  getDailyEntriesForWeek,
  listDailyEntries,
} from '../services/daily-timesheet.service.js'

const USER_ID = new ObjectId('507f1f77bcf86cd799439021')
const OTHER_USER_ID = new ObjectId('507f1f77bcf86cd799439022')
const PROJECT_ID = new ObjectId('507f1f77bcf86cd799439031')
const ASSIGNMENT_ID = new ObjectId('507f1f77bcf86cd799439061')

function fieldMatches(actual: any, expected: any): boolean {
  if (expected instanceof ObjectId) return actual?.toString() === expected.toString()
  if (expected === null) return actual === null || actual === undefined
  if (expected && typeof expected === 'object') {
    if ('$ne' in expected) {
      return actual?.toString() !== expected.$ne?.toString()
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
    deleteOne: vi.fn((query: any) => {
      const index = items.findIndex((item) => matches(item, query))
      if (index === -1) return Promise.resolve({ deletedCount: 0 })
      items.splice(index, 1)
      return Promise.resolve({ deletedCount: 1 })
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
  }
  return col
}

function setupDb(initialDaily: any[] = []) {
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
    [COLLECTIONS.DAILY_TIMESHEETS]: collectionWith(initialDaily),
    [COLLECTIONS.TIMESHEETS]: collectionWith(),
  }

  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => collections[name] ?? collectionWith()),
  } as unknown as Awaited<ReturnType<typeof getDb>>)

  return collections
}

describe('Phase 2 — Daily Timesheet Service Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates regular daily entry and auto-links active assignment when omitted', async () => {
    setupDb()

    const entry = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-28', // Monday
      hours: 8,
      entryType: 'regular',
      description: 'Worked on backend service',
    })

    expect(entry.id).toBeDefined()
    expect(entry.userId).toBe(USER_ID.toString())
    expect(entry.projectId).toBe(PROJECT_ID.toString())
    expect(entry.assignmentId).toBe(ASSIGNMENT_ID.toString())
    expect(entry.dayOfWeek).toBe('mon')
    expect(entry.hours).toBe(8)
    expect(entry.entryType).toBe('regular')
    expect(entry.status).toBe('draft')
  })

  it('upserts existing entry with same user, project, date, and entryType', async () => {
    setupDb()

    const entry1 = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-28',
      hours: 6,
      entryType: 'regular',
      description: 'Initial log',
    })

    const entry2 = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-28',
      hours: 8,
      entryType: 'regular',
      description: 'Updated log with extra 2h',
    })

    expect(entry2.id).toBe(entry1.id)
    expect(entry2.hours).toBe(8)
    expect(entry2.description).toBe('Updated log with extra 2h')
  })

  it('allows weekend overtime entries and rejects weekday overtime entries', async () => {
    setupDb()

    // Saturday overtime -> allowed
    const satEntry = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-10-03', // Saturday
      hours: 4,
      entryType: 'overtime',
      description: 'Weekend emergency fix',
    })
    expect(satEntry.entryType).toBe('overtime')
    expect(satEntry.dayOfWeek).toBe('sat')

    // Monday overtime -> rejected
    await expect(
      createDailyEntry(USER_ID.toString(), {
        projectId: PROJECT_ID.toString(),
        date: '2026-09-28', // Monday
        hours: 2,
        entryType: 'overtime',
        description: 'Overtime on Monday',
      })
    ).rejects.toThrow('Overtime entries are only permitted on Saturday and Sunday')
  })

  it('rejects regular entries on weekends', async () => {
    setupDb()

    await expect(
      createDailyEntry(USER_ID.toString(), {
        projectId: PROJECT_ID.toString(),
        date: '2026-10-04', // Sunday
        hours: 5,
        entryType: 'regular',
        description: 'Regular on Sunday',
      })
    ).rejects.toThrow('Regular hours are only allowed Monday through Friday')
  })

  it('enforces 24-hour daily limit per user across entries', async () => {
    setupDb()

    await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-29', // Tuesday
      hours: 18,
      entryType: 'regular',
      description: 'First big chunk',
    })

    await expect(
      createDailyEntry(USER_ID.toString(), {
        projectId: PROJECT_ID.toString(),
        date: '2026-09-29',
        hours: 25,
        entryType: 'regular',
        description: 'Over limit',
      })
    ).rejects.toThrow('Total daily hours cannot exceed 24 hours')
  })


  it('updates daily entries when unlocked', async () => {
    setupDb()

    const created = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-30', // Wednesday
      hours: 7,
      description: 'Original wednesday work',
    })

    const updated = await updateDailyEntry(created.id, USER_ID.toString(), {
      hours: 8,
      description: 'Updated wednesday work',
    })

    expect(updated.hours).toBe(8)
    expect(updated.description).toBe('Updated wednesday work')
  })

  it('prevents non-owner from updating daily entry', async () => {
    setupDb()

    const created = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-30',
      hours: 7,
      description: 'Work',
    })

    await expect(
      updateDailyEntry(created.id, OTHER_USER_ID.toString(), {
        hours: 8,
      })
    ).rejects.toThrow('You do not have permission to update this entry')
  })

  it('prevents updates or deletes on locked entries', async () => {
    const lockedId = new ObjectId()
    setupDb([
      {
        _id: lockedId,
        userId: USER_ID,
        projectId: PROJECT_ID,
        date: '2026-09-28',
        dayOfWeek: 'mon',
        hours: 8,
        entryType: 'regular',
        description: 'Locked day',
        status: 'locked',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    await expect(
      updateDailyEntry(lockedId.toString(), USER_ID.toString(), { hours: 4 })
    ).rejects.toThrow('Cannot modify a locked daily timesheet entry')

    await expect(
      deleteDailyEntry(lockedId.toString(), USER_ID.toString())
    ).rejects.toThrow('Cannot delete a locked daily timesheet entry')
  })

  it('deletes an unlocked daily entry', async () => {
    setupDb()

    const created = await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-10-01', // Thursday
      hours: 6,
      description: 'To be deleted',
    })

    await deleteDailyEntry(created.id, USER_ID.toString())

    const fetched = await getDailyEntryById(created.id)
    expect(fetched).toBeNull()
  })

  it('queries entries for a specific date', async () => {
    setupDb()

    await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-10-02', // Friday
      hours: 8,
      description: 'Friday work',
    })

    const results = await getDailyEntriesForDate(USER_ID.toString(), '2026-10-02')
    expect(results.length).toBe(1)
    expect(results[0].date).toBe('2026-10-02')
  })

  it('queries entries for a whole week', async () => {
    setupDb()

    // Add Mon, Wed, Fri
    await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-28',
      hours: 8,
      description: 'Mon',
    })
    await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-30',
      hours: 8,
      description: 'Wed',
    })
    await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-10-02',
      hours: 8,
      description: 'Fri',
    })

    const weekEntries = await getDailyEntriesForWeek(USER_ID.toString(), '2026-09-28')
    expect(weekEntries.length).toBe(3)
  })

  it('queries entries via listDailyEntries with filters', async () => {
    setupDb()

    await createDailyEntry(USER_ID.toString(), {
      projectId: PROJECT_ID.toString(),
      date: '2026-09-28',
      hours: 8,
      description: 'Mon test',
    })

    const list = await listDailyEntries({
      userId: USER_ID.toString(),
      projectId: PROJECT_ID.toString(),
      weekStart: '2026-09-28',
      status: 'draft',
    })
    expect(list.length).toBe(1)
    expect(list[0].description).toBe('Mon test')
  })
})

