import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

// Mock the database module
vi.mock('../lib/mongodb.js', () => ({
  getDb: vi.fn(),
}))

// Mock the activity service
vi.mock('../services/activity.service.js', () => ({
  createActivity: vi.fn(),
}))

// Mock the notification service
vi.mock('../services/notification.service.js', () => ({
  createNotification: vi.fn(),
}))

// Mock vercel blob
vi.mock('@vercel/blob', () => ({
  del: vi.fn(),
}))

import { getDb } from '../lib/mongodb.js'
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addTeamMember,
  removeTeamMember,
  assignSupervisor,
  getProjectsForUser,
} from '../services/project.service.js'

function createMockCollection(items: Record<string, unknown>[] = []) {
  let storedItems = [...items]
  return {
    find: vi.fn(() => ({
      toArray: vi.fn(() => Promise.resolve([...storedItems])),
      sort: vi.fn(() => ({
        toArray: vi.fn(() => Promise.resolve([...storedItems])),
      })),
    })),
    findOne: vi.fn(({ _id }: { _id: ObjectId }) => {
      const found = storedItems.find((item) => item._id.toString() === _id.toString())
      return Promise.resolve(found ?? null)
    }),
    findOneAndUpdate: vi.fn(({ _id }: { _id: ObjectId }, update: Record<string, unknown>) => {
      const index = storedItems.findIndex((item) => item._id.toString() === _id.toString())
      if (index === -1) return Promise.resolve(null)
      const existing = storedItems[index]
      const updated = { ...existing, ...update.$set }
      // Preserve ObjectId types for fields that should be ObjectIds
      if (existing.managerId instanceof ObjectId) updated.managerId = existing.managerId
      if (existing.supervisorId instanceof ObjectId) updated.supervisorId = existing.supervisorId
      if (existing.teamMemberIds) updated.teamMemberIds = existing.teamMemberIds
      storedItems[index] = updated
      return Promise.resolve(updated)
    }),
    insertOne: vi.fn((doc: Record<string, unknown>) => {
      const inserted = { _id: new ObjectId(), ...doc }
      storedItems.push(inserted)
      return Promise.resolve({ insertedId: inserted._id })
    }),
    deleteOne: vi.fn(() => Promise.resolve({ deletedCount: 1 })),
    deleteMany: vi.fn(() => Promise.resolve({ deletedCount: 0 })),
    updateMany: vi.fn(() => Promise.resolve({ modifiedCount: 0 })),
  }
}

describe('project.service', () => {
  const mockDb = {
    collection: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDb).mockResolvedValue(mockDb as never)
  })

  describe('getProjects', () => {
    it('returns all projects when no filters provided', async () => {
      const projects = [
        { _id: new ObjectId(), name: 'Project A', status: 'active' },
        { _id: new ObjectId(), name: 'Project B', status: 'draft' },
      ]
      mockDb.collection.mockReturnValue(createMockCollection(projects))

      const result = await getProjects()
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Project A')
    })

    it('filters by status when provided', async () => {
      const projects = [{ _id: new ObjectId(), name: 'Active Project', status: 'active' }]
      mockDb.collection.mockReturnValue(createMockCollection(projects))

      const result = await getProjects({ status: 'active' })
      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('active')
    })
  })

  describe('getProjectById', () => {
    it('returns project when found', async () => {
      const projectId = new ObjectId()
      const project = { _id: projectId, name: 'Test Project', status: 'active' }
      mockDb.collection.mockReturnValue(createMockCollection([project]))

      const result = await getProjectById(projectId.toString())
      expect(result).not.toBeNull()
      expect(result?.name).toBe('Test Project')
    })

    it('returns null when project not found', async () => {
      mockDb.collection.mockReturnValue(createMockCollection([]))

      const result = await getProjectById(new ObjectId().toString())
      expect(result).toBeNull()
    })
  })

  describe('createProject', () => {
    it('creates a project with valid input', async () => {
      mockDb.collection.mockReturnValue(createMockCollection([]))

      const result = await createProject({
        name: 'New Project',
        sowNumber: 'SOW-001',
        client: 'Client A',
        description: 'Test description',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        deadline: '2024-12-31',
        managerId: new ObjectId().toString(),
        supervisorId: new ObjectId().toString(),
        teamMemberIds: [new ObjectId().toString()],
      })

      expect(result.name).toBe('New Project')
      expect(result.sowNumber).toBe('SOW-001')
      expect(result.status).toBe('draft')
    })
  })

  describe('updateProject', () => {
    it('updates project fields', async () => {
      const projectId = new ObjectId()
      const project = { _id: projectId, name: 'Old Name', status: 'draft' }
      mockDb.collection.mockReturnValue(createMockCollection([project]))

      const result = await updateProject(projectId.toString(), {
        name: 'Updated Name',
        managerId: new ObjectId().toString(),
      })

      expect(result).not.toBeNull()
      expect(result?.name).toBe('Updated Name')
    })
  })

  describe('addTeamMember', () => {
    it('adds a team member to project', async () => {
      const projectId = new ObjectId()
      const userId = new ObjectId()
      const managerId = new ObjectId()
      const project = {
        _id: projectId,
        name: 'Test Project',
        managerId,
        supervisorId: null,
        teamMemberIds: [],
        documentIds: [],
        status: 'draft',
      }
      mockDb.collection.mockReturnValue(createMockCollection([project]))

      const result = await addTeamMember(projectId.toString(), userId.toString())
      expect(result).not.toBeNull()
    })
  })

  describe('removeTeamMember', () => {
    it('removes a team member from project', async () => {
      const projectId = new ObjectId()
      const userId = new ObjectId()
      const managerId = new ObjectId()
      const project = {
        _id: projectId,
        name: 'Test Project',
        managerId,
        supervisorId: null,
        teamMemberIds: [userId],
        documentIds: [],
        status: 'draft',
      }
      mockDb.collection.mockReturnValue(createMockCollection([project]))

      const result = await removeTeamMember(projectId.toString(), userId.toString())
      expect(result).not.toBeNull()
    })
  })

  describe('assignSupervisor', () => {
    it('assigns supervisor to project', async () => {
      const projectId = new ObjectId()
      const supervisorId = new ObjectId()
      const managerId = new ObjectId()
      const project = {
        _id: projectId,
        name: 'Test Project',
        managerId,
        supervisorId: null,
        teamMemberIds: [],
        documentIds: [],
        status: 'draft',
      }
      mockDb.collection.mockReturnValue(createMockCollection([project]))

      const result = await assignSupervisor(projectId.toString(), supervisorId.toString())
      expect(result).not.toBeNull()
    })
  })
})
