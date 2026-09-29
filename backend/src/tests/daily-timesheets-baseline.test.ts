import { describe, it, expect, vi, beforeEach } from 'vitest'
import { COLLECTIONS, ensureDailyTimesheetIndexes, ensureIndexes } from '../lib/collections.js'
import { getDb } from '../lib/mongodb.js'
import type { DailyTimesheet } from '../services/daily-timesheet.service.js'

vi.mock('../lib/mongodb.js')

function createMockCollection() {
  return {
    createIndex: vi.fn().mockResolvedValue('idx'),
  }
}

describe('Phase 0 — daily timesheets scaffolding', () => {
  it('declares the DAILY_TIMESHEETS collection constant', () => {
    expect(COLLECTIONS.DAILY_TIMESHEETS).toBe('daily_timesheets')
  })

  it('declares and typechecks DailyTimesheet model structure', () => {
    const mockDaily: DailyTimesheet = {
      id: 'd1',
      userId: 'u1',
      projectId: 'p1',
      assignmentId: 'a1',
      weeklyTimesheetId: 'w1',
      date: '2026-09-28',
      dayOfWeek: 'mon',
      hours: 8,
      entryType: 'regular',
      description: 'Worked on daily timesheet scaffolding',
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(mockDaily.date).toBe('2026-09-28')
    expect(mockDaily.status).toBe('draft')
  })

  it('ensureDailyTimesheetIndexes creates compound unique and lookup indexes', async () => {
    const createdIndexes: Array<{ spec: unknown; opts: unknown }> = []
    const mockCollection = {
      createIndex: vi.fn(async (spec: unknown, opts: unknown) => {
        createdIndexes.push({ spec, opts })
        return 'idx'
      }),
    }

    vi.mocked(getDb).mockResolvedValue({
      collection: vi.fn(() => mockCollection),
    } as unknown as Awaited<ReturnType<typeof getDb>>)

    await ensureDailyTimesheetIndexes()

    expect(createdIndexes.length).toBe(4)
    expect(createdIndexes[0]).toEqual({
      spec: { userId: 1, projectId: 1, date: 1, entryType: 1 },
      opts: { unique: true },
    })
    expect(createdIndexes[1]).toEqual({
      spec: { weeklyTimesheetId: 1 },
      opts: undefined,
    })
    expect(createdIndexes[2]).toEqual({
      spec: { userId: 1, date: 1 },
      opts: undefined,
    })
    expect(createdIndexes[3]).toEqual({
      spec: { assignmentId: 1 },
      opts: undefined,
    })
  })
})
