import { describe, it, expect, vi, beforeEach } from 'vitest'
// @ts-expect-error — supertest types are not ESM-compatible with NodeNext
import request from 'supertest'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import * as jwt from '../lib/jwt.js'
import { invalidateUserCache } from '../middleware/auth.js'
import { ObjectId } from 'mongodb'
import { ROLE_CATALOG, CAPABILITY_CATALOG } from '../services/capabilities.js'

vi.mock('../lib/mongodb', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
}))

vi.mock('../lib/jwt', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}))

function createChainableCursor(docs: any[] = []): any {
  const cursor: any = {
    toArray: vi.fn().mockResolvedValue(docs),
    sort: vi.fn(() => cursor),
    project: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    skip: vi.fn(() => cursor),
  }
  return cursor
}

/** Rows the roles aggregate would return: one group per stored (role, emsRole). */
const ROLE_ROWS = [
  { _id: { role: 'admin', emsRole: 'admin' }, count: 2 },
  { _id: { role: 'user', emsRole: 'manager' }, count: 3 },
  { _id: { role: 'user', emsRole: null }, count: 11 },
]

const USER_ID = new ObjectId('507f1f77bcf86cd799439001')

/**
 * `authenticate` re-reads the user document and derives the EMS role from it via
 * `resolveEmsRole`, so the mocked `findOne` has to return a real document —
 * the token payload's role is not what gets authorized.
 */
function setupAuth(role: string) {
  vi.mocked(jwt.verifyAccessToken).mockResolvedValue({
    userId: USER_ID.toString(),
    role,
    billable: false,
    exp: 9999999999,
  } as any)
  users.findOne.mockResolvedValue({
    _id: USER_ID,
    email: `${role}@test.local`,
    role,
    emsRole: role,
    status: 'active',
    billable: false,
  })
}

const users = {
  find: vi.fn(() => createChainableCursor([])),
  findOne: vi.fn(),
  aggregate: vi.fn(() => createChainableCursor(ROLE_ROWS)),
}

describe('GET /roles — admin only', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateUserCache(USER_ID.toString())
    users.aggregate.mockReturnValue(createChainableCursor(ROLE_ROWS))
    vi.mocked(getDb).mockResolvedValue({ collection: () => users } as any)
  })

  it('serves the four-role catalog with live headcounts', async () => {
    setupAuth('admin')
    const res = await request(createApp()).get('/api/v1/roles').set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(200)
    expect(res.body.roles.map((r: any) => r.key)).toEqual(['admin', 'hr', 'manager', 'employee'])
    const byKey = Object.fromEntries(res.body.roles.map((r: any) => [r.key, r.userCount]))
    // Counts must come from resolveEmsRole, so a platform `user` row with an
    // `emsRole` override is counted under the override, not under `user`.
    expect(byKey.admin).toBe(2)
    expect(byKey.manager).toBe(3)
    expect(byKey.employee).toBe(11)
  })

  it('serves every catalogued capability grouped, with no gaps or duplicates', async () => {
    setupAuth('admin')
    const res = await request(createApp()).get('/api/v1/roles').set('Authorization', 'Bearer valid-token')
    const cells = res.body.groups.flatMap((g: any) => g.capabilities)
    expect(cells).toHaveLength(CAPABILITY_CATALOG.length)
    expect(new Set(cells.map((c: any) => c.key)).size).toBe(CAPABILITY_CATALOG.length)
    for (const cell of cells) {
      expect(Object.keys(cell.granted).sort()).toEqual(ROLE_CATALOG.map((r) => r.key).sort())
    }
  })

  it('reports the enforced matrix, not a hand-maintained copy', async () => {
    setupAuth('admin')
    const res = await request(createApp()).get('/api/v1/roles').set('Authorization', 'Bearer valid-token')
    const cell = (key: string) =>
      res.body.groups.flatMap((g: any) => g.capabilities).find((c: any) => c.key === key)

    // Spot-check the corners of the matrix against the documented behaviour.
    expect(cell('manageUsers').granted).toMatchObject({ admin: true, hr: true, manager: false, employee: false })
    expect(cell('viewOwnAttendance').granted).toMatchObject({ admin: true, hr: true, manager: true, employee: true })
    // The admin ATTENDANCE_EXEMPT rule: an admin may read their own attendance
    // but is barred from marking it, unlike every other role.
    expect(cell('markAttendance').granted).toMatchObject({ admin: false, hr: true, manager: true, employee: true })
    // Nobody but admin sees payroll or the audit log.
    expect(cell('viewAuditLog').granted).toMatchObject({ admin: true, hr: false, manager: false, employee: false })
    // Billable-dependent access is flagged so the UI can say so.
    expect(cell('openTimesheetPlatform').billableGated).toBe(true)
    expect(cell('viewPayroll').billableGated).toBe(false)
  })

  it('refuses non-admins', async () => {
    setupAuth('hr')
    const res = await request(createApp()).get('/api/v1/roles').set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(403)
  })

  it('refuses anonymous callers', async () => {
    vi.mocked(jwt.verifyAccessToken).mockResolvedValue(null as any)
    users.findOne.mockResolvedValue(null)
    const res = await request(createApp()).get('/api/v1/roles').set('Authorization', 'Bearer valid-token').set('Authorization', 'Bearer valid-token')
    expect(res.status).toBe(401)
  })
})
