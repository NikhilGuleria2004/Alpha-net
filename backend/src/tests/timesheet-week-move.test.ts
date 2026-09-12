/// <reference types="vitest" />
// H3 (QA.md) regression: a timesheet's weekStart must be immutable via update.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateTimesheet } from '../services/timesheet.service.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js')

function createMockCollection() {
  return {
    findOne: vi.fn(),
    insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId('507f1f77bcf86cd799439099') }),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
  }
}

function setupMocks() {
  vi.mocked(getDb).mockReset()
  const timesheetsCollection = createMockCollection()
  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => (name === COLLECTIONS.TIMESHEETS ? timesheetsCollection : createMockCollection())),
  } as any)
  return timesheetsCollection
}

function existingTimesheetDoc(weekStart: string) {
  return {
    _id: new ObjectId('507f1f77bcf86cd799439011'),
    userId: new ObjectId('507f1f77bcf86cd799439021'),
    projectId: new ObjectId('507f1f77bcf86cd799439031'),
    weekStart,
    status: 'draft',
    entries: [],
    notes: '',
    regularHours: 0,
    overtimeHours: 0,
    totalHours: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('updateTimesheet — weekStart is immutable (QA H3)', () => {
  beforeEach(setupMocks)

  it('rejects moving an existing timesheet to a different week', async () => {
    setupMocks().findOne.mockResolvedValue(existingTimesheetDoc('2024-01-01'))

    await expect(
      updateTimesheet(
        '507f1f77bcf86cd799439011',
        { projectId: '507f1f77bcf86cd799439031', weekStart: '2024-01-08', entries: [], notes: '' },
        '507f1f77bcf86cd799439021',
      ),
    ).rejects.toThrow('Cannot move a timesheet to a different week')
  })

  it('allows saving when weekStart is unchanged (same normalized week)', async () => {
    const timesheetsCollection = setupMocks()
    timesheetsCollection.findOne.mockResolvedValue(existingTimesheetDoc('2024-01-01'))
    timesheetsCollection.findOneAndUpdate.mockResolvedValue(existingTimesheetDoc('2024-01-01'))

    const updated = await updateTimesheet(
      '507f1f77bcf86cd799439011',
      { projectId: '507f1f77bcf86cd799439031', weekStart: '2024-01-01', entries: [], notes: '' },
      '507f1f77bcf86cd799439021',
    )

    expect(updated).not.toBeNull()
    expect(updated?.weekStart).toBe('2024-01-01')
  })
})