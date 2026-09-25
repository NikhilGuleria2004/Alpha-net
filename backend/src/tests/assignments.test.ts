// Flow Integration Phase 3 tests (checklist Phase 3). Mocked getDb — no live Mongo.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js', () => ({ getDb: vi.fn() }))
vi.mock('../services/activity.service.js', () => ({ createActivity: vi.fn() }))
vi.mock('../services/notification.service.js', () => ({ createNotification: vi.fn() }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))

import { getDb } from '../lib/mongodb.js'
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  terminateAssignmentSchema,
} from '../schemas/assignment.schema.js'

function matches(doc: any, query: any): boolean {
  return Object.entries(query ?? {}).every(([key, value]) => {
    const actual = doc?.[key]
    if (value instanceof ObjectId) return actual?.toString() === value.toString()
    return actual === value
  })
}

// Minimal in-memory collection double: enough for the assignment service's
// find/findOne/insertOne/findOneAndUpdate/updateOne usage (mirrors the Phase 1
// clients.test.ts helper style).
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
      return {
        sort: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve(rows())) })),
        toArray: vi.fn(() => Promise.resolve(rows())),
      }
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
      if (update?.$addToSet) {
        for (const [key, value] of Object.entries<any>(update.$addToSet)) {
          const current: any[] = items[index][key] ?? []
          const ids = new Set(current.map((id: any) => id.toString()))
          if (!ids.has(value.toString())) items[index] = { ...items[index], [key]: [...current, value] }
        }
      }
      return Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
    }),
  }
  return col
}

function mockDbFor(collections: Record<string, any>) {
  vi.mocked(getDb).mockResolvedValue({
    collection: vi.fn((name: string) => collections[name] ?? collectionWith()),
  } as unknown as Awaited<ReturnType<typeof getDb>>)
}

const RESOURCE_ID = new ObjectId()
const PROJECT_ID = new ObjectId()
const CLIENT_ID = new ObjectId()

function baseCreate(overrides: Record<string, unknown> = {}) {
  return {
    resourceId: RESOURCE_ID.toString(),
    projectId: PROJECT_ID.toString(),
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    billRate: 120,
    payRate: 65,
    ...overrides,
  }
}

describe('Phase 3 — assignment schema', () => {
  it('accepts a minimal body and applies documented defaults', () => {
    const parsed: any = createAssignmentSchema.parse(baseCreate())
    expect(parsed.status).toBeUndefined()
    expect(parsed.billingType).toBeUndefined()
    expect(parsed.resourceId).toBe(RESOURCE_ID.toString())
  })
  it('rejects missing rates, negative rates, bad enums and inverted dates', () => {
    expect(() => createAssignmentSchema.parse({ ...baseCreate(), billRate: undefined })).toThrow()
    expect(() => createAssignmentSchema.parse({ ...baseCreate(), payRate: -1 })).toThrow()
    expect(() => createAssignmentSchema.parse({ ...baseCreate(), billingType: 'perUnit' })).toThrow()
    expect(() => createAssignmentSchema.parse({ ...baseCreate(), status: 'paused' })).toThrow()
    expect(() => createAssignmentSchema.parse({ ...baseCreate(), startDate: '2026-12-31', endDate: '2026-09-01' })).toThrow()
  })
  it('update schema never accepts resourceId/projectId (identity is immutable)', () => {
    const parsed: any = updateAssignmentSchema.parse({
      payRate: 70,
      resourceId: new ObjectId().toString(),
      projectId: new ObjectId().toString(),
    } as any)
    expect(parsed.payRate).toBe(70)
    expect(parsed).not.toHaveProperty('resourceId')
    expect(parsed).not.toHaveProperty('projectId')
  })
  it('terminate schema allows an empty body and an optional endDate', () => {
    expect(() => terminateAssignmentSchema.parse({})).not.toThrow()
    expect(terminateAssignmentSchema.parse({ endDate: '2026-10-01' }).endDate).toBe('2026-10-01')
    expect(() => terminateAssignmentSchema.parse({ endDate: '01-10-2026' })).toThrow()
  })
})

function seededCollections(overrides: Record<string, any> = {}) {
  return {
    users: collectionWith([{ _id: RESOURCE_ID, name: 'Jane', status: 'active', defaultPayRate: 65 }]),
    projects: collectionWith([
      { _id: PROJECT_ID, name: 'Sony Migration', client: 'Sony', clientId: CLIENT_ID, startDate: '2026-09-01', endDate: '2026-12-31', hourlyRate: 120, teamMemberIds: [] },
    ]),
    clients: collectionWith([{ _id: CLIENT_ID, name: 'Sony', normalizedName: 'sony', createdAt: new Date(), updatedAt: new Date() }]),
    assignments: collectionWith([]),
    activities: collectionWith([]),
    ...overrides,
  }
}

describe('Phase 3 — createAssignment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists defaults (hourly / required / active) and returns the assignment', async () => {
    const collections = seededCollections()
    mockDbFor(collections)
    const { createAssignment } = await import('../services/assignment.service.js')
    const assignment = await createAssignment(baseCreate() as any)
    expect(assignment.id).toBeTruthy()
    expect(assignment.billingType).toBe('hourly')
    expect(assignment.timesheetRequired).toBe(true)
    expect(assignment.approvalRequired).toBe(true)
    expect(assignment.status).toBe('active')
    const saved = collections.assignments.items[0]
    expect(saved.resourceId.toString()).toBe(RESOURCE_ID.toString())
    expect(saved.projectId.toString()).toBe(PROJECT_ID.toString())
    expect(saved.billRate).toBe(120)
    expect(saved.payRate).toBe(65)
  })

  it('dual-writes the resource onto projects.teamMemberIds when active', async () => {
    const collections = seededCollections()
    mockDbFor(collections)
    const { createAssignment } = await import('../services/assignment.service.js')
    await createAssignment(baseCreate() as any)
    const project = collections.projects.items[0]
    expect(project.teamMemberIds.map((id: any) => id.toString())).toEqual([RESOURCE_ID.toString()])
    const update = collections.projects.updateOne.mock.calls[0][1]
    expect(update.$addToSet.teamMemberIds.toString()).toBe(RESOURCE_ID.toString())
    expect(update.$pull).toBeUndefined()
  })

  it('does NOT dual-write for a non-active assignment', async () => {
    const collections = seededCollections()
    mockDbFor(collections)
    const { createAssignment } = await import('../services/assignment.service.js')
    await createAssignment(baseCreate({ status: 'onHold' }) as any)
    expect(collections.projects.updateOne).not.toHaveBeenCalled()
    expect(collections.assignments.items[0].status).toBe('onHold')
  })

  it('inherits project.clientId when clientId is omitted', async () => {
    const collections = seededCollections()
    mockDbFor(collections)
    const { createAssignment } = await import('../services/assignment.service.js')
    const assignment = await createAssignment(baseCreate() as any)
    expect(assignment.clientId).toBe(CLIENT_ID.toString())
  })

  it('upserts the client from the legacy project.client string when the project has no clientId', async () => {
    const projects = collectionWith([
      { _id: PROJECT_ID, name: 'Legacy', client: 'Sony', startDate: '2026-09-01', endDate: '2026-12-31', hourlyRate: 100, teamMemberIds: [] },
    ])
    const clients = collectionWith([])
    const collections = seededCollections({ projects, clients })
    mockDbFor(collections)
    const { createAssignment } = await import('../services/assignment.service.js')
    const assignment = await createAssignment(baseCreate() as any)
    expect(clients.insertOne).toHaveBeenCalledTimes(1)
    expect(clients.items[0].normalizedName).toBe('sony')
    expect(assignment.clientId).toBe(clients.items[0]._id.toString())
  })

  it('rejects an explicit unknown clientId', async () => {
    const collections = seededCollections()
    mockDbFor(collections)
    const { createAssignment } = await import('../services/assignment.service.js')
    await expect(createAssignment(baseCreate({ clientId: new ObjectId().toString() }) as any))
      .rejects.toThrow('Client not found')
  })

  it('validates resource, project, dates and duplicate active pairs', async () => {
    const collections = seededCollections()
    mockDbFor(collections)
    const { createAssignment } = await import('../services/assignment.service.js')
    await expect(createAssignment(baseCreate({ resourceId: 'not-an-id' }) as any)).rejects.toThrow('Resource not found')
    await expect(createAssignment(baseCreate({ resourceId: new ObjectId().toString() }) as any)).rejects.toThrow('Resource not found')
    await expect(createAssignment(baseCreate({ projectId: new ObjectId().toString() }) as any)).rejects.toThrow('Project not found')
    await expect(createAssignment(baseCreate({ endDate: '2026-08-01' }) as any)).rejects.toThrow('startDate must be on or before endDate')

    await createAssignment(baseCreate() as any)
    await expect(createAssignment(baseCreate() as any)).rejects.toThrow('Resource already has an active assignment on this project')
    // 2 inserts total: one successful create + the resource's first assignment.
    expect(collections.assignments.insertOne).toHaveBeenCalledTimes(1)
  })
})


describe('Phase 3 — getActiveAssignment / resolveAssignmentForTimesheet', () => {
  beforeEach(() => vi.clearAllMocks())

  const activeAssignment = {
    _id: new ObjectId(),
    resourceId: RESOURCE_ID,
    projectId: PROJECT_ID,
    clientId: CLIENT_ID,
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    billRate: 120,
    payRate: 65,
    billingType: 'hourly',
    timesheetRequired: true,
    approvalRequired: true,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('returns only the active assignment for the pair', async () => {
    const assignments = collectionWith([
      { ...activeAssignment, _id: new ObjectId(), status: 'terminated' },
      activeAssignment,
    ])
    mockDbFor(seededCollections({ assignments }))
    const { getActiveAssignment } = await import('../services/assignment.service.js')
    const found = await getActiveAssignment(RESOURCE_ID.toString(), PROJECT_ID.toString())
    expect(found?.id).toBe(activeAssignment._id.toString())
    expect(await getActiveAssignment(RESOURCE_ID.toString(), new ObjectId().toString())).toBeNull()
    expect(await getActiveAssignment('nope', PROJECT_ID.toString())).toBeNull()
  })

  it('resolves an explicit id but validates ownership, project and status', async () => {
    const assignments = collectionWith([activeAssignment])
    mockDbFor(seededCollections({ assignments }))
    const { resolveAssignmentForTimesheet } = await import('../services/assignment.service.js')
    const resolved = await resolveAssignmentForTimesheet({
      resourceId: RESOURCE_ID.toString(),
      projectId: PROJECT_ID.toString(),
      assignmentId: activeAssignment._id.toString(),
    })
    expect(resolved?.id).toBe(activeAssignment._id.toString())
    await expect(resolveAssignmentForTimesheet({
      resourceId: new ObjectId().toString(),
      projectId: PROJECT_ID.toString(),
      assignmentId: activeAssignment._id.toString(),
    })).rejects.toThrow('Assignment does not belong to this resource')
    await expect(resolveAssignmentForTimesheet({
      resourceId: RESOURCE_ID.toString(),
      projectId: new ObjectId().toString(),
      assignmentId: activeAssignment._id.toString(),
    })).rejects.toThrow('Assignment does not belong to this project')
    await expect(resolveAssignmentForTimesheet({
      resourceId: RESOURCE_ID.toString(),
      projectId: PROJECT_ID.toString(),
      assignmentId: new ObjectId().toString(),
    })).rejects.toThrow('Assignment not found')
    await expect(resolveAssignmentForTimesheet({
      resourceId: RESOURCE_ID.toString(),
      projectId: PROJECT_ID.toString(),
      assignmentId: 'bogus',
    })).rejects.toThrow('Assignment not found')
  })

  it('auto-resolves when the id is omitted and never throws when none exists', async () => {
    const assignmentId = new ObjectId()
    const onHold = { ...activeAssignment, _id: assignmentId, status: 'onHold' }
    mockDbFor(seededCollections({ assignments: collectionWith([onHold]) }))
    const { resolveAssignmentForTimesheet } = await import('../services/assignment.service.js')
    expect(await resolveAssignmentForTimesheet({
      resourceId: RESOURCE_ID.toString(),
      projectId: PROJECT_ID.toString(),
    })).toBeNull()
    // An explicit id pointing at a non-active assignment must fail loudly.
    await expect(resolveAssignmentForTimesheet({
      resourceId: RESOURCE_ID.toString(),
      projectId: PROJECT_ID.toString(),
      assignmentId: assignmentId.toString(),
    })).rejects.toThrow('Assignment is not active')
  })
})


describe('Phase 3 — updateAssignment / terminateAssignment', () => {
  beforeEach(() => vi.clearAllMocks())

  const existing = () => ({
    _id: new ObjectId(),
    resourceId: RESOURCE_ID,
    projectId: PROJECT_ID,
    clientId: CLIENT_ID,
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    billRate: 120,
    payRate: 65,
    billingType: 'hourly',
    timesheetRequired: true,
    approvalRequired: true,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  it('patches mutable fields and preserves identity fields', async () => {
    const doc = existing()
    mockDbFor(seededCollections({ assignments: collectionWith([doc]) }))
    const { updateAssignment } = await import('../services/assignment.service.js')
    const updated = await updateAssignment(doc._id.toString(), {
      payRate: 70, billRate: 130, billingType: 'monthly', poSow: 'SOW-9', billingEntity: 'Eniac US',
    })
    expect(updated?.payRate).toBe(70)
    expect(updated?.billRate).toBe(130)
    expect(updated?.billingType).toBe('monthly')
    expect(updated?.poSow).toBe('SOW-9')
    expect(updated?.resourceId).toBe(RESOURCE_ID.toString())
    expect(updated?.projectId).toBe(PROJECT_ID.toString())
  })

  it('rejects an inverted window against the stored dates and unknown ids', async () => {
    const doc = existing()
    mockDbFor(seededCollections({ assignments: collectionWith([doc]) }))
    const { updateAssignment } = await import('../services/assignment.service.js')
    await expect(updateAssignment(doc._id.toString(), { endDate: '2026-08-01' }))
      .rejects.toThrow('startDate must be on or before endDate')
    expect(await updateAssignment(new ObjectId().toString(), { payRate: 1 })).toBeNull()
    expect(await updateAssignment('bogus', { payRate: 1 })).toBeNull()
  })

  it('re-activating restores the project roster entry', async () => {
    const doc = { ...existing(), status: 'onHold' }
    const collections = seededCollections({ assignments: collectionWith([doc]) })
    mockDbFor(collections)
    const { updateAssignment } = await import('../services/assignment.service.js')
    const updated = await updateAssignment(doc._id.toString(), { status: 'active' })
    expect(updated?.status).toBe('active')
    expect(collections.projects.items[0].teamMemberIds.map((id: any) => id.toString())).toEqual([RESOURCE_ID.toString()])
  })

  it('terminate sets the terminal status and NEVER pulls teamMemberIds', async () => {
    const doc = existing()
    const collections = seededCollections({ assignments: collectionWith([doc]) })
    mockDbFor(collections)
    const { terminateAssignment } = await import('../services/assignment.service.js')
    const terminated = await terminateAssignment(doc._id.toString(), { endDate: '2026-10-15' })
    expect(terminated?.status).toBe('terminated')
    expect(terminated?.endDate).toBe('2026-10-15')
    expect(collections.projects.updateOne).not.toHaveBeenCalled()
    // The project roster is untouched (legacy team membership stays as-is).
    expect(collections.projects.items[0].teamMemberIds).toEqual([])
    expect(await terminateAssignment(new ObjectId().toString())).toBeNull()
  })
})

describe('Phase 3 — backfill-assignments is idempotent', () => {
  beforeEach(() => vi.clearAllMocks())

  const project = () => ({
    _id: PROJECT_ID,
    name: 'Sony Migration',
    client: 'Sony',
    clientId: CLIENT_ID,
    startDate: '2026-09-01',
    endDate: '2026-12-31',
    hourlyRate: 120,
    teamMemberIds: [RESOURCE_ID, new ObjectId('507f1f77bcf86cd799439021')],
  })

  it('creates one active assignment per legacy membership with inherited rates', async () => {
    const users = collectionWith([
      { _id: RESOURCE_ID, defaultPayRate: 65 },
      { _id: new ObjectId('507f1f77bcf86cd799439021'), defaultPayRate: undefined },
    ])
    const projects = {
      find: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([project()])) })),
    }
    const assignments = collectionWith([])
    mockDbFor(seededCollections({ users, projects, assignments }))
    const { backfillAssignments } = await import('../scripts/backfill-assignments.js')
    const run = await backfillAssignments({ dryRun: false })
    expect(run.projectsScanned).toBe(1)
    expect(run.pairsConsidered).toBe(2)
    expect(run.created).toBe(2)
    expect(run.existing).toBe(0)
    expect(assignments.items).toHaveLength(2)
    expect(assignments.items[0].status).toBe('active')
    expect(assignments.items[0].billRate).toBe(120)
    expect(assignments.items[0].payRate).toBe(65)
    expect(assignments.items[0].clientId.toString()).toBe(CLIENT_ID.toString())
    // A resource with no default pay rate must not block the backfill.
    expect(assignments.items[1].payRate).toBe(0)
  })

  it('second run creates 0 rows and reports the pairs as existing', async () => {
    const users = collectionWith([
      { _id: RESOURCE_ID, defaultPayRate: 65 },
      { _id: new ObjectId('507f1f77bcf86cd799439021'), defaultPayRate: 70 },
    ])
    const projects = {
      find: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([project()])) })),
    }
    const assignments = collectionWith([
      { _id: new ObjectId(), resourceId: RESOURCE_ID, projectId: PROJECT_ID, status: 'active' },
      { _id: new ObjectId(), resourceId: new ObjectId('507f1f77bcf86cd799439021'), projectId: PROJECT_ID, status: 'active' },
    ])
    mockDbFor(seededCollections({ users, projects, assignments }))
    const { backfillAssignments } = await import('../scripts/backfill-assignments.js')
    const run = await backfillAssignments({ dryRun: false })
    expect(run.created).toBe(0)
    expect(run.existing).toBe(2)
    expect(assignments.insertOne).not.toHaveBeenCalled()
  })

  it('dry run writes nothing and skips deleted resources without failing', async () => {
    const users = collectionWith([{ _id: RESOURCE_ID, defaultPayRate: 65 }])
    const projects = {
      find: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([{ ...project(), teamMemberIds: [RESOURCE_ID, new ObjectId()] }])) })),
    }
    const assignments = collectionWith([])
    mockDbFor(seededCollections({ users, projects, assignments }))
    const { backfillAssignments } = await import('../scripts/backfill-assignments.js')
    const dry = await backfillAssignments({ dryRun: true })
    expect(dry.created).toBe(1)
    expect(dry.skipped).toBe(1)
    expect(assignments.insertOne).not.toHaveBeenCalled()
    const real = await backfillAssignments({ dryRun: false })
    expect(real.created).toBe(1)
    expect(real.skipped).toBe(1)
    expect(assignments.insertOne).toHaveBeenCalledTimes(1)
  })
})

describe('Phase 3 — access rules', () => {
  beforeEach(() => vi.clearAllMocks())

  const ASSIGNMENT_ID = new ObjectId('507f1f77bcf86cd799439020')
  const APPROVER_ID = new ObjectId('507f1f77bcf86cd799439022')
  const SUPERVISOR_ID = new ObjectId('507f1f77bcf86cd799439023')
  const OUTSIDER_ID = new ObjectId('507f1f77bcf86cd799439024')

  function accessDb(assignmentOverrides: Record<string, unknown> = {}) {
    return seededCollections({
      assignments: collectionWith([
        {
          _id: ASSIGNMENT_ID,
          resourceId: RESOURCE_ID,
          projectId: PROJECT_ID,
          approverId: APPROVER_ID,
          status: 'active',
          ...assignmentOverrides,
        },
      ]),
      projects: collectionWith([
        { _id: PROJECT_ID, name: 'P', teamMemberIds: [], supervisorId: SUPERVISOR_ID },
      ]),
    })
  }

  it('canAccessAssignment: admin always, owner and approver by relation', async () => {
    mockDbFor(accessDb())
    const { canAccessAssignment } = await import('../middleware/access.js')
    expect(await canAccessAssignment(OUTSIDER_ID.toString(), 'admin', false, ASSIGNMENT_ID.toString())).toBe(true)
    expect(await canAccessAssignment(RESOURCE_ID.toString(), 'user', false, ASSIGNMENT_ID.toString())).toBe(true)
    expect(await canAccessAssignment(APPROVER_ID.toString(), 'user', false, ASSIGNMENT_ID.toString())).toBe(true)
  })

  it('canAccessAssignment: project supervisor, unrelated user and bad ids', async () => {
    mockDbFor(accessDb())
    const { canAccessAssignment } = await import('../middleware/access.js')
    expect(await canAccessAssignment(SUPERVISOR_ID.toString(), 'user', true, ASSIGNMENT_ID.toString())).toBe(true)
    // A non-supervisor with no relation is denied.
    expect(await canAccessAssignment(SUPERVISOR_ID.toString(), 'user', false, ASSIGNMENT_ID.toString())).toBe(false)
    expect(await canAccessAssignment(OUTSIDER_ID.toString(), 'user', true, ASSIGNMENT_ID.toString())).toBe(false)
    expect(await canAccessAssignment(OUTSIDER_ID.toString(), 'user', true, 'not-an-id')).toBe(false)
    expect(await canAccessAssignment(OUTSIDER_ID.toString(), 'user', true, new ObjectId().toString())).toBe(false)
  })

  it('canAccessProject gains an OR with the assignment layer (never narrower)', async () => {
    const { canAccessProject } = await import('../middleware/access.js')
    // No assignment yet → legacy rule only → outsider denied.
    mockDbFor(accessDb({ resourceId: RESOURCE_ID }))
    expect(await canAccessProject(OUTSIDER_ID.toString(), 'user', false, PROJECT_ID.toString())).toBe(false)
    // An active assignment for the outsider grants read access.
    mockDbFor(seededCollections({
      assignments: collectionWith([
        { _id: new ObjectId(), resourceId: OUTSIDER_ID, projectId: PROJECT_ID, status: 'active' },
      ]),
      projects: collectionWith([
        { _id: PROJECT_ID, name: 'P', teamMemberIds: [], supervisorId: SUPERVISOR_ID },
      ]),
    }))
    expect(await canAccessProject(OUTSIDER_ID.toString(), 'user', false, PROJECT_ID.toString())).toBe(true)
    // A terminated assignment does NOT grant access.
    mockDbFor(seededCollections({
      assignments: collectionWith([
        { _id: new ObjectId(), resourceId: OUTSIDER_ID, projectId: PROJECT_ID, status: 'terminated' },
      ]),
      projects: collectionWith([
        { _id: PROJECT_ID, name: 'P', teamMemberIds: [], supervisorId: SUPERVISOR_ID },
      ]),
    }))
    expect(await canAccessProject(OUTSIDER_ID.toString(), 'user', false, PROJECT_ID.toString())).toBe(false)
  })
})

describe('Phase 3 — assignments routes mounted (additive)', () => {
  it('GET /health still ok and /api/v1/assignments requires auth (not 404)', async () => {
    const { createApp } = await import('../app.js')
    // @ts-ignore — supertest ships without types here; same pattern as auth.test.ts
    const { default: request } = await import('supertest')
    const app = createApp()
    const health = await request(app).get('/health')
    expect(health.status).toBe(200)
    const res = await request(app).get('/api/v1/assignments')
    expect([401, 403]).toContain(res.status)
    expect(res.status).not.toBe(404)
  })
})


