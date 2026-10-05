import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { tryParseObjectId } from '../lib/objectid.js'
import type {
  DateWindow,
  EmployeeStatsResult,
  HoursByEmployee,
  HoursByProject,
  OvertimeStats,
  ReportResult,
  ReportStatusFilter,
  TimesheetStatusBreakdown,
} from '../types/finance.js'

/**
 * Report queries (EMSBackend §7.7, task 7.2).
 *
 * Hours come from the shared `timesheets` collection (platform-written, EMS
 * read-only) using its pre-computed `regularHours` / `overtimeHours` /
 * `totalHours`. Timesheets are WEEKLY (`weekStart`), so a range filter selects
 * the weeks whose start falls inside the window.
 *
 * `statusBreakdown` is intentionally computed WITHOUT the `status` filter.
 * The breakdown is a distribution chart: if it honoured the filter, selecting
 * `approved` would zero out four of the five bars and show nothing useful. The
 * hours figures still respect the filter, so the numbers users act on are
 * correct — and an absent filter defaults to `approved` rather than to
 * everything (see the QA M8 note in `types/report.ts`).
 */

const PRESET_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }

const ALL_STATUSES: TimesheetStatusBreakdown = {
  draft: 0,
  pending: 0,
  approved: 0,
  declined: 0,
  withdrawn: 0,
}

/**
 * Turn the wire filters into an absolute window plus a Mongo filter.
 * `custom` without both dates is a 400 rather than a silent full-range scan.
 */
export function resolveWindow(filters: {
  dateRange: string
  startDate?: string
  endDate?: string
}): { window: DateWindow; query: Record<string, any> } {
  let from: string
  let to: string

  if (filters.dateRange === 'custom') {
    if (!filters.startDate || !filters.endDate) {
      const err: any = new Error('custom dateRange requires both startDate and endDate')
      err.code = 'INVALID_RANGE'
      throw err
    }
    from = filters.startDate
    to = filters.endDate
  } else {
    const days = PRESET_DAYS[filters.dateRange] ?? 30
    const now = new Date()
    to = now.toISOString().slice(0, 10)
    const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    from = start.toISOString().slice(0, 10)
  }

  if (from > to) {
    const err: any = new Error('startDate must be on or before endDate')
    err.code = 'INVALID_RANGE'
    throw err
  }

  return { window: { from, to }, query: { weekStart: { $gte: from, $lte: to } } }
}

/** Scope filters shared by every aggregation (everything except `status`). */
function scopeQuery(filters: {
  window: DateWindow
  projectId?: string
  userId?: string
  department?: string
}): Record<string, any> {
  const query: Record<string, any> = { weekStart: { $gte: filters.window.from, $lte: filters.window.to } }

  if (filters.projectId) {
    const oid = tryParseObjectId(filters.projectId)
    if (oid) query.projectId = oid
  }
  if (filters.userId) {
    const oid = tryParseObjectId(filters.userId)
    if (oid) query.userId = oid
  }
  // `department` lives on the user, not the timesheet, so it is applied after
  // the user lookup below rather than here.

  return query
}

/**
 * Resolve which users are in scope, so `department` can be honoured without an
 * unindexed join. Returns null when no department filter was requested.
 */
async function resolveUserScope(
  userId: string | undefined,
  department: string | undefined,
): Promise<Set<string> | null> {
  if (!department) return null
  const db = await getDb()
  const query: Record<string, any> = { department }
  if (userId) {
    const oid = tryParseObjectId(userId)
    if (oid) query._id = oid
  }
  const users = await db.collection(COLLECTIONS.USERS).find(query).project({ _id: 1 }).toArray()
  return new Set(users.map((u: any) => String(u._id)))
}

interface Bucket {
  key: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

function emptyStats(): OvertimeStats {
  return { regularHours: 0, overtimeHours: 0, totalHours: 0 }
}

function addHours(target: OvertimeStats, sheet: any) {
  target.regularHours += sheet.regularHours ?? 0
  target.overtimeHours += sheet.overtimeHours ?? 0
  target.totalHours += sheet.totalHours ?? 0
}

function roundStats(stats: OvertimeStats): OvertimeStats {
  return {
    regularHours: Math.round(stats.regularHours * 100) / 100,
    overtimeHours: Math.round(stats.overtimeHours * 100) / 100,
    totalHours: Math.round(stats.totalHours * 100) / 100,
  }
}

/**
 * POST /reports/query — org-wide roll-up.
 * Roles: admin/hr/manager see everything; an employee is denied at the route
 * (they use `/reports/employee-stats`).
 */
export async function runReport(filters: {
  dateRange: string
  startDate?: string
  endDate?: string
  projectId?: string
  userId?: string
  department?: string
  status?: ReportStatusFilter
  scopeUserIds?: string[]
}): Promise<ReportResult> {
  const db = await getDb()
  const { window } = resolveWindow(filters)

  const baseQuery = scopeQuery({ window, projectId: filters.projectId, userId: filters.userId })

  // Supervisor scope wins over a client-supplied userId.
  if (filters.scopeUserIds) {
    const ids = filters.scopeUserIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
    baseQuery.userId = { $in: ids }
  }

  const userScope = await resolveUserScope(filters.userId, filters.department)
  if (userScope) {
    baseQuery.userId = { $in: [...userScope].map((id) => new ObjectId(id)) }
  }

  // The status filter applies to the hours figures only.
  // An absent status defaults to 'approved', never to "everything": counting
  // draft/declined/withdrawn weeks as worked hours is exactly the QA M8 defect
  // the frontend type documents. Only an explicit 'all' opts out.
  const hoursQuery: Record<string, any> = { ...baseQuery }
  const statusFilter = filters.status ?? 'approved'
  if (statusFilter !== 'all') {
    hoursQuery.status = statusFilter
  }

  const [hoursSheets, statusSheets] = await Promise.all([
    db.collection(COLLECTIONS.TIMESHEETS).find(hoursQuery).toArray(),
    db.collection(COLLECTIONS.TIMESHEETS).find(baseQuery).toArray(),
  ])

  // Breakdowns + totals.
  const statusBreakdown: TimesheetStatusBreakdown = { ...ALL_STATUSES }
  for (const sheet of statusSheets as any[]) {
    const status = sheet.status as keyof TimesheetStatusBreakdown
    if (status in statusBreakdown) statusBreakdown[status] += 1
  }

  const byProject = new Map<string, Bucket>()
  const byEmployee = new Map<string, Bucket>()
  const overtimeStats = emptyStats()

  for (const sheet of hoursSheets as any[]) {
    addHours(overtimeStats, sheet)

    const projectKey = sheet.projectId ? String(sheet.projectId) : 'unassigned'
    const projectBucket = byProject.get(projectKey) ?? {
      key: projectKey,
      regularHours: 0,
      overtimeHours: 0,
      totalHours: 0,
    }
    addHours(projectBucket, sheet)
    byProject.set(projectKey, projectBucket)

    const userKey = sheet.userId ? String(sheet.userId) : 'unassigned'
    const employeeBucket = byEmployee.get(userKey) ?? {
      key: userKey,
      regularHours: 0,
      overtimeHours: 0,
      totalHours: 0,
    }
    addHours(employeeBucket, sheet)
    byEmployee.set(userKey, employeeBucket)
  }

  // Resolve display names for projects and people in one pass each.
  const projectNames = await resolveNames(
    COLLECTIONS.PROJECTS,
    [...byProject.keys()].filter((id) => ObjectId.isValid(id)),
    'name',
  )
  const employees = await resolveEmployees([...byEmployee.keys()].filter((id) => ObjectId.isValid(id)))

  const hoursByProject: HoursByProject[] = [...byProject.values()]
    .map((bucket) => ({
      projectId: bucket.key,
      projectName: bucket.key === 'unassigned' ? 'Unassigned' : projectNames.get(bucket.key) ?? 'Unknown project',
      regularHours: Math.round(bucket.regularHours * 100) / 100,
      overtimeHours: Math.round(bucket.overtimeHours * 100) / 100,
      totalHours: Math.round(bucket.totalHours * 100) / 100,
    }))
    .sort((a, b) => b.totalHours - a.totalHours)

  const hoursByEmployee: HoursByEmployee[] = [...byEmployee.values()]
    .map((bucket) => {
      const employee = employees.get(bucket.key)
      return {
        userId: bucket.key,
        userName: bucket.key === 'unassigned' ? 'Unassigned' : employee?.name ?? 'Unknown employee',
        department: employee?.department ?? '',
        regularHours: Math.round(bucket.regularHours * 100) / 100,
        overtimeHours: Math.round(bucket.overtimeHours * 100) / 100,
        totalHours: Math.round(bucket.totalHours * 100) / 100,
      }
    })
    .sort((a, b) => b.totalHours - a.totalHours)

  return {
    hoursByProject,
    hoursByEmployee,
    overtimeStats: roundStats(overtimeStats),
    statusBreakdown,
  }
}

/**
 * GET /reports/employee-stats — the caller's own numbers, always scoped to
 * themselves. Same shape minus the org-wide employee roll-up (the frontend type
 * omits it, so sending one would be dead weight the page never reads).
 */
export async function getEmployeeStats(
  userId: string,
  dateRange: string,
  startDate?: string,
  endDate?: string,
): Promise<EmployeeStatsResult> {
  const result = await runReport({ dateRange, startDate, endDate, userId })

  return {
    hoursByProject: result.hoursByProject,
    overtimeStats: result.overtimeStats,
    statusBreakdown: result.statusBreakdown,
  }
}

async function resolveNames(collection: string, ids: string[], field: string): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const db = await getDb()
  const docs = await db
    .collection(collection)
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
    .project({ [field]: 1 })
    .toArray()
  return new Map(docs.map((d: any) => [String(d._id), d[field] ?? '']))
}

async function resolveEmployees(ids: string[]): Promise<Map<string, { name: string; department: string }>> {
  if (ids.length === 0) return new Map()
  const db = await getDb()
  const docs = await db
    .collection(COLLECTIONS.USERS)
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
    .project({ name: 1, department: 1 })
    .toArray()
  return new Map(
    docs.map((d: any) => [String(d._id), { name: d.name ?? '', department: d.department ?? '' }]),
  )
}