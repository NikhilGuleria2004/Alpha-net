import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import type { TimesheetStatus } from './timesheet.service.js'

export interface HoursByProject {
  projectId: string
  projectName: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface HoursByEmployee {
  userId: string
  userName: string
  department: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface OvertimeStats {
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface TimesheetStatusBreakdown {
  draft: number
  pending: number
  approved: number
  declined: number
  withdrawn: number
}

export interface ReportFilters {
  startDate?: string
  endDate?: string
  projectId?: string
  userId?: string
  department?: string
  // QA M8: hours aggregations previously counted draft/declined/withdrawn
  // timesheets as worked hours, inflating payroll/BI totals. A status filter is
  // now applied when present; the Reports UI defaults to "approved" so the
  // numbers users act on are correct out of the box. Pass 'all' to opt out.
  status?: TimesheetStatus | 'all'
}

async function getDepartmentUserIds(department: string): Promise<string[]> {
  const db = await getDb()
  const users = await db.collection(COLLECTIONS.USERS).find({ department }).toArray()
  return users.map((u) => u._id.toString())
}

function buildMatchStage(filters: ReportFilters, userIdsInDepartment?: string[]): Record<string, unknown> {
  const match: Record<string, unknown> = {}

  if (filters.startDate || filters.endDate) {
    const range: Record<string, string> = {}
    if (filters.startDate) range.$gte = filters.startDate
    if (filters.endDate) range.$lte = filters.endDate
    match.weekStart = range
  }

  if (filters.projectId) {
    match.projectId = new ObjectId(filters.projectId)
  }

  // QA M8: userId and department used to be mutually exclusive branches, so
  // supplying both let the department branch silently overwrite the userId
  // filter. They now intersect: a row must match whichever conditions are set.
  const userConditions: Record<string, unknown>[] = []
  if (filters.userId) {
    userConditions.push({ userId: new ObjectId(filters.userId) })
  }
  if (filters.department) {
    if (!userIdsInDepartment || userIdsInDepartment.length === 0) {
      // No users in this department — nothing can match. Represented as an
      // always-false condition so the caller doesn't need special-casing.
      userConditions.push({ userId: new ObjectId('000000000000000000000000') })
    } else {
      userConditions.push({ userId: { $in: userIdsInDepartment.map((id) => new ObjectId(id)) } })
    }
  }
  if (userConditions.length === 1) {
    Object.assign(match, userConditions[0])
  } else if (userConditions.length > 1) {
    match.$and = userConditions
  }

  if (filters.status && filters.status !== 'all') {
    match.status = filters.status
  }

  return match
}

export async function getHoursByProject(filters: ReportFilters): Promise<HoursByProject[]> {
  const db = await getDb()
  const userIdsInDepartment = filters.department ? await getDepartmentUserIds(filters.department) : []
  const match = buildMatchStage(filters, userIdsInDepartment)

  const results = await db.collection(COLLECTIONS.TIMESHEETS).aggregate([
    { $match: match },
    {
      $group: {
        _id: '$projectId',
        regularHours: { $sum: '$regularHours' },
        overtimeHours: { $sum: '$overtimeHours' },
        totalHours: { $sum: '$totalHours' },
      },
    },
    { $sort: { totalHours: -1 } },
  ]).toArray()

  const projectIds = results.map((r) => new ObjectId(r._id))
  const projects = await db.collection(COLLECTIONS.PROJECTS).find({ _id: { $in: projectIds } }).toArray()
  const projectMap = new Map(projects.map((p) => [p._id.toString(), p.name]))

  return results.map((r) => ({
    projectId: r._id.toString(),
    projectName: projectMap.get(r._id.toString()) || 'Unknown',
    regularHours: r.regularHours || 0,
    overtimeHours: r.overtimeHours || 0,
    totalHours: r.totalHours || 0,
  }))
}

export async function getHoursByEmployee(filters: ReportFilters): Promise<HoursByEmployee[]> {
  const db = await getDb()
  const userIdsInDepartment = filters.department ? await getDepartmentUserIds(filters.department) : []
  const match = buildMatchStage(filters, userIdsInDepartment)

  const results = await db.collection(COLLECTIONS.TIMESHEETS).aggregate([
    { $match: match },
    {
      $group: {
        _id: '$userId',
        regularHours: { $sum: '$regularHours' },
        overtimeHours: { $sum: '$overtimeHours' },
        totalHours: { $sum: '$totalHours' },
      },
    },
    { $sort: { totalHours: -1 } },
  ]).toArray()

  const userIds = results.map((r) => new ObjectId(r._id))
  const users = await db.collection(COLLECTIONS.USERS).find({ _id: { $in: userIds } }).toArray()
  const userMap = new Map(users.map((u) => [u._id.toString(), { name: u.name, department: u.department }]))

  return results.map((r) => {
    const user = userMap.get(r._id.toString())
    return {
      userId: r._id.toString(),
      userName: user?.name || 'Unknown',
      department: user?.department || 'Unknown',
      regularHours: r.regularHours || 0,
      overtimeHours: r.overtimeHours || 0,
      totalHours: r.totalHours || 0,
    }
  })
}

export async function getOvertimeStats(filters: ReportFilters): Promise<OvertimeStats> {
  const db = await getDb()
  const userIdsInDepartment = filters.department ? await getDepartmentUserIds(filters.department) : []
  const match = buildMatchStage(filters, userIdsInDepartment)

  const results = await db.collection(COLLECTIONS.TIMESHEETS).aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        regularHours: { $sum: '$regularHours' },
        overtimeHours: { $sum: '$overtimeHours' },
        totalHours: { $sum: '$totalHours' },
      },
    },
  ]).toArray()

  const result = results[0]

  return {
    regularHours: result?.regularHours || 0,
    overtimeHours: result?.overtimeHours || 0,
    totalHours: result?.totalHours || 0,
  }
}

export async function getTimesheetStatusBreakdown(filters: ReportFilters): Promise<TimesheetStatusBreakdown> {
  const db = await getDb()
  const userIdsInDepartment = filters.department ? await getDepartmentUserIds(filters.department) : []
  const match = buildMatchStage(filters, userIdsInDepartment)

  const results = await db.collection(COLLECTIONS.TIMESHEETS).aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]).toArray()

  const breakdown: TimesheetStatusBreakdown = {
    draft: 0,
    pending: 0,
    approved: 0,
    declined: 0,
    withdrawn: 0,
  }

  for (const r of results) {
    const status = r._id as keyof TimesheetStatusBreakdown
    if (status in breakdown) {
      breakdown[status] = r.count
    }
  }

  return breakdown
}
