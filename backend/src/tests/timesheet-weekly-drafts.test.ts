/// <reference types="vitest" />
// Weekly draft auto-creation (Vercel cron): every active project's team gets an
// empty draft timesheet for the target week. Idempotent via $setOnInsert.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWeeklyDrafts, emptyEntry } from '../services/timesheet.service.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js')

function createMockCollection() {
  return {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
  }
}

function setupMocks() {
  vi.mocked(getDb).mockReset()
  const timesheetsCollection = createMockCollection()
  const projectsCollection = createMockCollection()
  const usersCollection = createMockCollection()
  const activitiesCollection = createMockCollection()

  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.TIMESHEETS) return timesheetsCollection
      if (name === COLLECTIONS.PROJECTS) return projectsCollection
      if (name === COLLECTIONS.USERS) return usersCollection
      if (name === COLLECTIONS.ACTIVITIES) return activitiesCollection
      return createMockCollection()
    }),
  } as any)

  return { timesheetsCollection, projectsCollection, usersCollection, activitiesCollection }
}

const PROJECT_ID = new ObjectId('507f1f77bcf86cd799439031')
const MEMBER_ID = new ObjectId('507f1f77bcf86cd799439021')

function activeProject() {
  return {
    _id: PROJECT_ID,
    teamMemberIds: [MEMBER_ID],
  }
}

function activeUser() {
  return { _id: MEMBER_ID, status: 'active' }
}

describe('createWeeklyDrafts', () => {
  beforeEach(setupMocks)

  it('creates one draft per active team member per active project', async () => {
    const m = setupMocks()
    m.projectsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([activeProject()]) })
    m.usersCollection.findOne.mockResolvedValue(activeUser())
    m.timesheetsCollection.updateOne.mockResolvedValue({ upsertedCount: 1, upsertedId: new ObjectId() })

    const result = await createWeeklyDrafts('2024-01-01')

    expect(result.weekStart).toBe('2024-01-01')
    expect(result.created).toBe(1)
    expect(result.skipped).toBe(0)
    expect(m.timesheetsCollection.updateOne).toHaveBeenCalledWith(
      { userId: MEMBER_ID, projectId: PROJECT_ID, weekStart: '2024-01-01' },
      { $setOnInsert: expect.objectContaining({
        status: 'draft',
        weekStart: '2024-01-01',
        entries: expect.arrayContaining([expect.objectContaining({ entryType: 'regular' })]),
      }) },
      { upsert: true },
    )
  })

  it('is idempotent: an existing timesheet is skipped, not duplicated', async () => {
    const m = setupMocks()
    m.projectsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([activeProject()]) })
    m.usersCollection.findOne.mockResolvedValue(activeUser())
    // upsertedCount 0 == a matching (user, project, week) doc already exists
    m.timesheetsCollection.updateOne.mockResolvedValue({ upsertedCount: 0, upsertedId: null })

    const result = await createWeeklyDrafts('2024-01-01')

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors).toEqual([])
  })

  it('skips inactive team members', async () => {
    const m = setupMocks()
    m.projectsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([activeProject()]) })
    m.usersCollection.findOne.mockResolvedValue(null) // not found / not active

    const result = await createWeeklyDrafts('2024-01-01')

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(m.timesheetsCollection.updateOne).not.toHaveBeenCalled()
  })

  it('ignores projects that are not active or overdue', async () => {
    const m = setupMocks()
    m.projectsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })

    const result = await createWeeklyDrafts('2024-01-01')

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(0)
    expect(m.timesheetsCollection.updateOne).not.toHaveBeenCalled()
  })

  it('records per-member errors without aborting the run', async () => {
    const m = setupMocks()
    m.projectsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([activeProject()]) })
    m.usersCollection.findOne.mockResolvedValue(activeUser())
    m.timesheetsCollection.updateOne.mockRejectedValue(new Error('boom'))

    const result = await createWeeklyDrafts('2024-01-01')

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('boom')
  })

  it('defaults to the current week when no weekStart is given', async () => {
    const m = setupMocks()
    m.projectsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })

    const result = await createWeeklyDrafts()

    // Must be a Monday.
    expect(result.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const d = new Date(result.weekStart + 'T00:00:00Z')
    expect(d.getUTCDay()).toBe(1) // Monday
  })

  it('emptyEntry produces a zeroed regular entry', () => {
    const e = emptyEntry()
    expect(e.entryType).toBe('regular')
    expect(e.description).toBe('')
    expect(e.hours).toEqual({ mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 })
  })
})