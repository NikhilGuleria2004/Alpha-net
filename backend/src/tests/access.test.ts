import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  canAccessProject,
  canEditProject,
  canAccessTimesheet,
  canEditTimesheet,
  canReviewTimesheet,
  canManageUser,
} from '../middleware/access.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js')

function createMockCollection(findOneResult: any) {
  return {
    findOne: vi.fn().mockResolvedValue(findOneResult),
  }
}

function mockGetDb(timesheetsResult: any, projectsResult: any) {
  const db = {
    collection: vi.fn((name: string) => {
      if (name === COLLECTIONS.PROJECTS) return createMockCollection(projectsResult)
      if (name === COLLECTIONS.TIMESHEETS) return createMockCollection(timesheetsResult)
      return createMockCollection(null)
    }),
  }
  vi.mocked(getDb).mockResolvedValue(db as any)
}

describe('canAccessProject', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('allows admin', async () => {
    expect(await canAccessProject('user1', 'admin', false, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('allows team member', async () => {
    const memberId = new ObjectId('507f1f77bcf86cd799439011')
    mockGetDb(null, {
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      teamMemberIds: [memberId],
      supervisorId: new ObjectId('507f1f77bcf86cd799439013'),
    })
    expect(await canAccessProject(memberId.toString(), 'user', false, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('allows supervisor', async () => {
    const supervisorId = new ObjectId('507f1f77bcf86cd799439013')
    mockGetDb(null, {
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      teamMemberIds: [],
      supervisorId,
    })
    expect(await canAccessProject(supervisorId.toString(), 'user', true, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('denies non-member non-supervisor', async () => {
    mockGetDb(null, {
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      teamMemberIds: [],
      supervisorId: new ObjectId('507f1f77bcf86cd799439013'),
    })
    expect(await canAccessProject('507f1f77bcf86cd799439014', 'user', false, '507f1f77bcf86cd799439012')).toBe(false)
  })

  it('denies when project not found', async () => {
    mockGetDb(null, null)
    expect(await canAccessProject('user1', 'user', false, '507f1f77bcf86cd799439012')).toBe(false)
  })
})

describe('canEditProject', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('allows admin', async () => {
    expect(await canEditProject('user1', 'admin', false, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('allows supervisor', async () => {
    const supervisorId = new ObjectId('507f1f77bcf86cd799439013')
    mockGetDb(null, {
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      teamMemberIds: [],
      supervisorId,
    })
    expect(await canEditProject(supervisorId.toString(), 'user', true, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('denies team member', async () => {
    const memberId = new ObjectId('507f1f77bcf86cd799439011')
    mockGetDb(null, {
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      teamMemberIds: [memberId],
      supervisorId: new ObjectId('507f1f77bcf86cd799439013'),
    })
    expect(await canEditProject(memberId.toString(), 'user', false, '507f1f77bcf86cd799439012')).toBe(false)
  })

  it('denies when project not found', async () => {
    mockGetDb(null, null)
    expect(await canEditProject('user1', 'user', false, '507f1f77bcf86cd799439012')).toBe(false)
  })
})

describe('canAccessTimesheet', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('allows admin', async () => {
    expect(await canAccessTimesheet('user1', 'admin', false, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('allows owner', async () => {
    const ownerId = new ObjectId('507f1f77bcf86cd799439011')
    mockGetDb(
      { _id: new ObjectId('507f1f77bcf86cd799439012'), userId: ownerId, projectId: new ObjectId('507f1f77bcf86cd799439014') },
      null
    )
    expect(await canAccessTimesheet(ownerId.toString(), 'user', false, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('allows supervisor of the project', async () => {
    const supervisorId = new ObjectId('507f1f77bcf86cd799439013')
    mockGetDb(
      { _id: new ObjectId('507f1f77bcf86cd799439012'), userId: new ObjectId('507f1f77bcf86cd799439011'), projectId: new ObjectId('507f1f77bcf86cd799439014') },
      { _id: new ObjectId('507f1f77bcf86cd799439014'), supervisorId }
    )
    expect(await canAccessTimesheet(supervisorId.toString(), 'user', true, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('denies unrelated supervisor', async () => {
    const unrelatedSupervisorId = new ObjectId('507f1f77bcf86cd799439015')
    mockGetDb(
      { _id: new ObjectId('507f1f77bcf86cd799439012'), userId: new ObjectId('507f1f77bcf86cd799439011'), projectId: new ObjectId('507f1f77bcf86cd799439014') },
      { _id: new ObjectId('507f1f77bcf86cd799439014'), supervisorId: new ObjectId('507f1f77bcf86cd799439013') }
    )
    expect(await canAccessTimesheet(unrelatedSupervisorId.toString(), 'user', true, '507f1f77bcf86cd799439012')).toBe(false)
  })

  it('denies when timesheet not found', async () => {
    mockGetDb(null, null)
    expect(await canAccessTimesheet('user1', 'user', false, '507f1f77bcf86cd799439012')).toBe(false)
  })
})

describe('canEditTimesheet', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('allows admin', async () => {
    expect(await canEditTimesheet('user1', 'admin', false, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('allows owner', async () => {
    const ownerId = new ObjectId('507f1f77bcf86cd799439011')
    mockGetDb(
      { _id: new ObjectId('507f1f77bcf86cd799439012'), userId: ownerId },
      null
    )
    expect(await canEditTimesheet(ownerId.toString(), 'user', false, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('denies non-owner', async () => {
    mockGetDb(
      { _id: new ObjectId('507f1f77bcf86cd799439012'), userId: new ObjectId('507f1f77bcf86cd799439011') },
      null
    )
    expect(await canEditTimesheet('507f1f77bcf86cd799439014', 'user', false, '507f1f77bcf86cd799439012')).toBe(false)
  })

  it('denies when timesheet not found', async () => {
    mockGetDb(null, null)
    expect(await canEditTimesheet('user1', 'user', false, '507f1f77bcf86cd799439012')).toBe(false)
  })
})

describe('canReviewTimesheet', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  it('allows admin', async () => {
    expect(await canReviewTimesheet('user1', 'admin', false, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('denies non-supervisor', async () => {
    mockGetDb(
      { _id: new ObjectId('507f1f77bcf86cd799439012'), userId: new ObjectId('507f1f77bcf86cd799439011'), projectId: new ObjectId('507f1f77bcf86cd799439014') },
      { _id: new ObjectId('507f1f77bcf86cd799439014'), supervisorId: new ObjectId('507f1f77bcf86cd799439013') }
    )
    expect(await canReviewTimesheet('507f1f77bcf86cd799439011', 'user', false, '507f1f77bcf86cd799439012')).toBe(false)
  })

  it('allows supervisor of the project', async () => {
    const supervisorId = new ObjectId('507f1f77bcf86cd799439013')
    mockGetDb(
      { _id: new ObjectId('507f1f77bcf86cd799439012'), userId: new ObjectId('507f1f77bcf86cd799439011'), projectId: new ObjectId('507f1f77bcf86cd799439014') },
      { _id: new ObjectId('507f1f77bcf86cd799439014'), supervisorId }
    )
    expect(await canReviewTimesheet(supervisorId.toString(), 'user', true, '507f1f77bcf86cd799439012')).toBe(true)
  })

  it('denies unrelated supervisor', async () => {
    const unrelatedSupervisorId = new ObjectId('507f1f77bcf86cd799439015')
    mockGetDb(
      { _id: new ObjectId('507f1f77bcf86cd799439012'), userId: new ObjectId('507f1f77bcf86cd799439011'), projectId: new ObjectId('507f1f77bcf86cd799439014') },
      { _id: new ObjectId('507f1f77bcf86cd799439014'), supervisorId: new ObjectId('507f1f77bcf86cd799439013') }
    )
    expect(await canReviewTimesheet(unrelatedSupervisorId.toString(), 'user', true, '507f1f77bcf86cd799439012')).toBe(false)
  })

  it('denies when timesheet not found', async () => {
    mockGetDb(null, null)
    expect(await canReviewTimesheet('user1', 'user', true, '507f1f77bcf86cd799439012')).toBe(false)
  })
})

describe('canManageUser', () => {
  it('allows admin', async () => {
    expect(await canManageUser('user1', 'admin')).toBe(true)
  })

  it('denies non-admin', async () => {
    expect(await canManageUser('user1', 'user')).toBe(false)
    expect(await canManageUser('user1', 'supervisor')).toBe(false)
  })
})
