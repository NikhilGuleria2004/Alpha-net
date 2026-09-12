/// <reference types="vitest" />
// H4 (QA.md) regression: approve/decline must use the single review authority
// from middleware/access.ts (admin OR the timesheet's project supervisor).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { approveTimesheet, declineTimesheet } from '../services/approval.service.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js')

const TIMESHEET_ID = '507f1f77bcf86cd799439011'
const OWNER_ID = '507f1f77bcf86cd799439021'
const PROJECT_ID = '507f1f77bcf86cd799439031'
const SUPERVISOR_ID = '507f1f77bcf86cd799439041'
const OTHER_ID = '507f1f77bcf86cd799439051'

function createMockCollection(overrides: Record<string, unknown> = {}) {
  return {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId('507f1f77bcf86cd799439099') }),
    find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    ...overrides,
  }
}

function timesheetDoc(status = 'pending') {
  return {
    _id: new ObjectId(TIMESHEET_ID),
    userId: new ObjectId(OWNER_ID),
    projectId: new ObjectId(PROJECT_ID),
    weekStart: '2024-01-01',
    entries: [],
    notes: '',
    regularHours: 8,
    overtimeHours: 0,
    totalHours: 8,
    status,
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function reviewerDoc(id: string) {
  return {
    _id: new ObjectId(id),
    name: 'Reviewer',
    email: 'reviewer@eniac.demo',
    employeeId: 'EMP-REV',
    department: 'Engineering',
    role: 'user',
    isSupervisor: true,
    status: 'active',
    supervisorId: null,
  }
}

function setupMocks(reviewerId: string, projectSupervisorId: string) {
  const db = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.TIMESHEETS) {
        return createMockCollection({
          findOne: vi.fn().mockResolvedValue(timesheetDoc()),
          findOneAndUpdate: vi.fn().mockResolvedValue(timesheetDoc('approved')),
        })
      }
      if (name === COLLECTIONS.PROJECTS) {
        return createMockCollection({
          findOne: vi.fn().mockResolvedValue({
            _id: new ObjectId(PROJECT_ID),
            name: 'Project Alpha',
            supervisorId: new ObjectId(projectSupervisorId),
          }),
        })
      }
      if (name === COLLECTIONS.USERS) {
        return createMockCollection({
          findOne: vi.fn().mockResolvedValue(reviewerDoc(reviewerId)),
        })
      }
      return createMockCollection()
    }),
  }
  vi.mocked(getDb).mockResolvedValue(db as any)
}

describe('approvals — single review authority (QA H4 regression)', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('approves when the reviewer is the project supervisor', async () => {
    setupMocks(SUPERVISOR_ID, SUPERVISOR_ID)
    const approved = await approveTimesheet(TIMESHEET_ID, SUPERVISOR_ID)
    expect(approved).not.toBeNull()
    expect(approved?.status).toBe('approved')
  })

    it('rejects approval by a supervisor who is not the project supervisor', async () => {
    setupMocks(OTHER_ID, SUPERVISOR_ID)
    await expect(approveTimesheet(TIMESHEET_ID, OTHER_ID)).rejects.toThrow('Not authorized to approve this timesheet')
  })

  it('rejects decline by a supervisor who is not the project supervisor', async () => {
    setupMocks(OTHER_ID, SUPERVISOR_ID)
    await expect(declineTimesheet(TIMESHEET_ID, OTHER_ID, 'Not good')).rejects.toThrow('Not authorized to decline this timesheet')
  })

  it('blocks a user from reviewing their own submission (H5 separation of duties)', async () => {
    setupMocks(OWNER_ID, OWNER_ID) // reviewer is the employee who owns the timesheet
    await expect(approveTimesheet(TIMESHEET_ID, OWNER_ID)).rejects.toThrow('Not authorized to approve this timesheet')
    await expect(declineTimesheet(TIMESHEET_ID, OWNER_ID, 'My own reason')).rejects.toThrow('Not authorized to decline this timesheet')
  })

  it('allows an admin to review their own submission (admins exempt from H5)', async () => {
    const timesheetOwner = OWNER_ID
    vi.mocked(getDb).mockReset()
    const setupAdminMocks = (reviewerId: string, projectSupervisorId: string) => {
      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.TIMESHEETS) {
            return createMockCollection({
              findOne: vi.fn().mockResolvedValue(timesheetDoc()),
              findOneAndUpdate: vi.fn().mockResolvedValue(timesheetDoc('approved')),
            })
          }
          if (name === COLLECTIONS.PROJECTS) {
            return createMockCollection({
              findOne: vi.fn().mockResolvedValue({
                _id: new ObjectId(PROJECT_ID),
                name: 'Project Alpha',
                supervisorId: new ObjectId(projectSupervisorId),
              }),
            })
          }
          if (name === COLLECTIONS.USERS) {
            return createMockCollection({
              findOne: vi.fn().mockResolvedValue({ ...reviewerDoc(reviewerId), role: 'admin' }),
            })
          }
          return createMockCollection()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as any)
    }
    // admin reviewing their own timesheet
    setupAdminMocks(timesheetOwner, timesheetOwner)
    const approved = await approveTimesheet(TIMESHEET_ID, timesheetOwner)
    expect(approved).not.toBeNull()
    expect(approved?.status).toBe('approved')
  })
})