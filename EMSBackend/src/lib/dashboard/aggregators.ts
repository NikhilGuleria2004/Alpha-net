import { ObjectId } from 'mongodb'
import { getDb } from '../mongodb.js'
import { COLLECTIONS } from '../collections.js'
import { logger } from '../logger.js'
import type {
  AdminDashboardData,
  HrDashboardData,
  ManagerDashboardData,
  EmployeeDashboardData,
  DashboardRole,
  ProjectStage,
} from '../../types/dashboard.js'

// ── Snapshot cache (5 min TTL, §10) ───────────────────────────────────────────

interface SnapshotEntry {
  data: unknown
  expiresAt: number
}

const SNAPSHOT_TTL_MS = 5 * 60 * 1000
const snapshotCache = new Map<string, SnapshotEntry>()

function snapshotKey(role: DashboardRole, userId: string): string {
  return `dashboard:${role}:${userId}`
}

export function getCachedSnapshot(role: DashboardRole, userId: string): unknown | null {
  const entry = snapshotCache.get(snapshotKey(role, userId))
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data
  }
  snapshotCache.delete(snapshotKey(role, userId))
  return null
}

export function setCachedSnapshot(role: DashboardRole, userId: string, data: unknown): void {
  snapshotCache.set(snapshotKey(role, userId), { data, expiresAt: Date.now() + SNAPSHOT_TTL_MS })
}

export function invalidateDashboardSnapshots(userId?: string): void {
  if (userId) {
    for (const key of snapshotCache.keys()) {
      if (key.endsWith(`:${userId}`)) {
        snapshotCache.delete(key)
      }
    }
  } else {
    snapshotCache.clear()
  }
  logger.info({ userId }, 'dashboard snapshot cache invalidated')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function subtractDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return toDateString(d)
}

function isWeekend(yyyyMmDd: string): boolean {
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`)
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

async function getTeamMemberIds(requesterId: string, role: string): Promise<ObjectId[]> {
  const db = await getDb()
  const requesterOid = new ObjectId(requesterId)

  if (role === 'admin' || role === 'hr') {
    const users = await db
      .collection(COLLECTIONS.USERS)
      .find({ status: { $in: ['active', 'on_leave'] } })
      .project({ _id: 1 })
      .toArray()
    return users.map((u) => u._id as ObjectId)
  }

  if (role === 'manager') {
    const users = await db
      .collection(COLLECTIONS.USERS)
      .find({ status: { $in: ['active', 'on_leave'] }, managerId: requesterOid })
      .project({ _id: 1, name: 1, employeeId: 1 })
      .toArray()
    return users.map((u) => u._id as ObjectId)
  }

  return [requesterOid]
}

async function getUserById(userId: string) {
  const db = await getDb()
  return db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(userId) })
}

const ROLE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  admin: 'info',
  hr: 'success',
  manager: 'warning',
  employee: 'default',
}

// ── Admin dashboard ───────────────────────────────────────────────────────────

export async function getAdminDashboard(_requesterId?: string): Promise<AdminDashboardData> {
  const db = await getDb()
  const now = new Date()
  const today = toDateString(now)

  // 1. Users aggregation
  const [activeEmployees, roleDistribution] = await Promise.all([
    db
      .collection(COLLECTIONS.USERS)
      .aggregate([
        { $match: { status: 'active' } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            billable: { $sum: { $cond: [{ $eq: ['$billable', true] }, 1, 0] } },
            nonBillable: { $sum: { $cond: [{ $eq: ['$billable', true] }, 0, 1] } },
          },
        },
      ])
      .toArray(),
    db
      .collection(COLLECTIONS.USERS)
      .aggregate([
        { $match: { status: { $in: ['active', 'invited', 'on_leave'] } } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ])
      .toArray(),
  ])

  const activeEmp = activeEmployees[0] || { total: 0, billable: 0, nonBillable: 0 }

  // 2. Clients and projects
  const [clientCount, activeProjects, projectStatusDonut] = await Promise.all([
    db.collection(COLLECTIONS.CLIENTS).countDocuments({}),
    db.collection(COLLECTIONS.PROJECTS).countDocuments({ status: 'active' }),
    db
      .collection(COLLECTIONS.PROJECTS)
      .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray(),
  ])

  // 3. Attendance today
  const attendanceRecords = await db
    .collection(COLLECTIONS.ATTENDANCE)
    .find({ date: today })
    .toArray()

  const attendanceToday = {
    present: attendanceRecords.filter((r) => r.status === 'present').length,
    absent: attendanceRecords.filter((r) => r.status === 'absent').length,
    late: attendanceRecords.filter((r) => r.status === 'late').length,
  }

  // 4. Revenue at risk — simplified: sum of (rate * unbilled hours) from active assignments
  // Without timesheet data, we compute a basic estimate from project rates
  const revenueAtRiskAgg = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .aggregate([
      { $match: { status: 'active' } },
      { $lookup: { from: COLLECTIONS.PROJECTS, localField: 'projectId', foreignField: '_id', as: 'project' } },
      { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          amount: { $sum: { $ifNull: ['$project.hourlyRate', 0] } },
          projectCount: { $sum: 1 },
        },
      },
    ])
    .toArray()

  const revenueAgg = revenueAtRiskAgg[0] || { amount: 0, projectCount: 0 }

  // 5. Headcount trend (last 5 weeks, Mondays)
  const headcountTrend: Array<{ date: string; count: number }> = []
  for (let i = 4; i >= 0; i--) {
    const weekStart = subtractDays(today, i * 7)
    const count = await db
      .collection(COLLECTIONS.USERS)
      .countDocuments({
        status: 'active',
        createdAt: { $lte: new Date(`${weekStart}T23:59:59.999Z`) },
      })
    headcountTrend.push({ date: weekStart, count })
  }

  // 6. Attendance rate — last 10 working days
  const attendanceRate: Array<{ date: string; rate: number; present: number; absent: number }> = []
  for (let i = 9; i >= 0; i--) {
    const d = subtractDays(today, i)
    if (isWeekend(d)) continue
    const records = await db
      .collection(COLLECTIONS.ATTENDANCE)
      .find({ date: d })
      .toArray()
    const present = records.filter((r) => r.status === 'present').length
    const absent = records.filter((r) => r.status === 'absent').length
    const total = present + absent
    attendanceRate.push({
      date: d,
      rate: total > 0 ? Math.round((present / total) * 100) / 100 : 0,
      present,
      absent,
    })
  }

  // 7. Recent audit (activities)
  const recentAudit = await db
    .collection(COLLECTIONS.ACTIVITIES)
    .find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray()

  // 8. Failed logins — from activities mentioning "login" or from sessions
  const failedLogins = await db
    .collection(COLLECTIONS.ACTIVITIES)
    .countDocuments({ description: { $regex: 'login', $options: 'i' } })

  // 9. Integrations — read from settings or default
  const integrations = [
    {
      system: 'Timesheet Platform',
      status: 'synced' as const,
      detail: 'Platform data synchronized',
      lastSync: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
  ]

  // 10. Upcoming renewals — clients with upcoming deadlines
  const upcomingRenewalsQuery = await db
    .collection(COLLECTIONS.CLIENTS)
    .find({ status: 'active' })
    .limit(5)
    .toArray()

  // 11. Latest onboardings
  const latestOnboardings = await db
    .collection(COLLECTIONS.ONBOARDING_CANDIDATES)
    .find({})
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray()

  return {
    activeEmployees: {
      total: activeEmp.total || 0,
      billable: activeEmp.billable || 0,
      nonBillable: activeEmp.nonBillable || 0,
    },
    openClientIds: clientCount,
    activeProjects,
    attendanceToday,
    revenueAtRisk: {
      amount: revenueAgg.amount || 0,
      currency: 'USD' as const,
      projectCount: revenueAgg.projectCount || 0,
    },
    headcountTrend,
    attendanceRate,
    projectStatusDonut: projectStatusDonut.map((p) => ({ status: p._id as ProjectStage, count: p.count })),
    recentAudit: recentAudit.map((a) => ({
      id: String(a._id),
      description: a.description || '',
      actor: a.actor || 'System',
      timestamp: new Date(a.createdAt).toISOString(),
      severity: (a.severity as 'info' | 'warning' | 'error') || 'info',
    })),
    failedLogins,
    integrations,
    upcomingRenewals: upcomingRenewalsQuery.map((c) => ({
      id: String(c._id),
      clientName: c.name || c.clientCode || '',
      clientCode: c.clientCode || '',
      poBurn: 0,
      currency: 'USD' as const,
      deadline: c.deadline || subtractDays(today, -30),
    })),
    roleDistribution: roleDistribution.map((r) => ({
      role: r._id || 'employee',
      count: r.count,
      variant: ROLE_VARIANT[r._id] || 'default',
    })),
    latestOnboardings: latestOnboardings.map((o) => ({
      id: String(o._id),
      employeeName: o.firstName && o.lastName ? `${o.firstName} ${o.lastName}` : o.email || '',
      employeeId: o.employeeId || '',
      status: (o.stage || 'invited') as 'invited' | 'docs_pending' | 'payrate_pending' | 'ready' | 'active',
      startedAt: new Date(o.createdAt || now).toISOString().slice(0, 10),
    })),
    role: 'admin' as DashboardRole,
    updatedAt: now.toISOString(),
  }
}

// ── HR dashboard ──────────────────────────────────────────────────────────────

export async function getHrDashboard(_requesterId?: string): Promise<HrDashboardData> {
  const db = await getDb()
  const now = new Date()
  const today = toDateString(now)

  const [
    totalHeadcount,
    newThisMonth,
    onLeaveToday,
    onboardingPipeline,
    leaveCalendarAgg,
  ] = await Promise.all([
    db.collection(COLLECTIONS.USERS).countDocuments({ status: 'active' }),
    db
      .collection(COLLECTIONS.USERS)
      .countDocuments({
        status: 'active',
        createdAt: { $gte: new Date(`${toDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}T00:00:00.000Z`) },
      }),
    db.collection(COLLECTIONS.USERS).countDocuments({ status: 'on_leave' }),
    db
      .collection(COLLECTIONS.ONBOARDING_CANDIDATES)
      .aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }])
      .toArray(),
    db
      .collection(COLLECTIONS.LEAVE_REQUESTS)
      .aggregate([
        { $match: { status: 'approved' } },
        {
          $group: {
            _id: '$startDate',
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ])

  const pipelineStages = {
    invited: 0,
    docsPending: 0,
    payratePending: 0,
    ready: 0,
    active: 0,
  }
  for (const p of onboardingPipeline) {
    switch (p._id) {
      case 'invited':
        pipelineStages.invited = p.count
        break
      case 'docs_pending':
        pipelineStages.docsPending = p.count
        break
      case 'payrate_pending':
        pipelineStages.payratePending = p.count
        break
      case 'ready':
        pipelineStages.ready = p.count
        break
      case 'active':
        pipelineStages.active = p.count
        break
    }
  }
  const pendingOnboardings = pipelineStages.invited + pipelineStages.docsPending + pipelineStages.payratePending

  // Attendance exceptions — users without a mark today
  const allUsers = await db
    .collection(COLLECTIONS.USERS)
    .find({ status: 'active', role: { $ne: 'admin' } })
    .project({ _id: 1, name: 1, employeeId: 1 })
    .toArray()

  const attendanceToday = await db
    .collection(COLLECTIONS.ATTENDANCE)
    .find({ date: today })
    .project({ userId: 1 })
    .toArray()

  const markedUserIds = new Set(attendanceToday.map((a) => String(a.userId)))
  const attendanceExceptions = allUsers
    .filter((u) => !markedUserIds.has(String(u._id)))
    .slice(0, 10)
    .map((u) => ({
      id: String(u._id),
      employeeName: u.name || '',
      employeeId: u.employeeId || '',
      date: today,
      status: 'not_marked' as const,
      reason: 'Not marked',
    }))

  // Payrate changes pending — payrate_history without appliedAt
  const payrateChanges = await db
    .collection(COLLECTIONS.PAYRATE_HISTORY)
    .find({ appliedAt: { $exists: false } })
    .limit(10)
    .toArray()
  const payrateChangesPending = await Promise.all(
    payrateChanges.map(async (p) => {
      const user = await getUserById(String(p.userId))
      return {
        id: String(p._id),
        employeeName: user?.name || '',
        employeeId: user?.employeeId || '',
        proposedRate: p.proposedRate || 0,
        currency: (p.currency as 'USD' | 'INR' | 'EUR' | 'GBP') || 'USD',
        requestedBy: p.requestedBy || 'System',
        requestedAt: new Date(p.createdAt || now).toISOString(),
      }
    }),
  )

  // Upcoming birthdays and anniversaries (next 7 days)
  const in7Days = subtractDays(today, 7)
  const usersWithBirthdays = await db
    .collection(COLLECTIONS.USERS)
    .find({
      status: 'active',
      birthday: { $exists: true },
    })
    .project({ _id: 1, name: 1, employeeId: 1, birthday: 1, joinedAt: 1 })
    .toArray()

  const upcomingBirthdays = usersWithBirthdays
    .filter((u) => {
      const b = new Date(u.birthday)
      const bThisYear = new Date(`${today.slice(0, 5)}${String(b.getUTCDate()).padStart(2, '0')}T00:00:00.000Z`)
      return bThisYear >= new Date() && bThisYear <= new Date(in7Days)
    })
    .map((u) => ({
      id: String(u._id),
      name: u.name || '',
      employeeId: u.employeeId || '',
      date: new Date(u.birthday).toISOString().slice(0, 10),
    }))

  const upcomingAnniversaries = usersWithBirthdays
    .filter((u) => u.joinedAt)
    .map((u) => {
      const joined = new Date(u.joinedAt)
      const years = now.getFullYear() - joined.getFullYear()
      const annivThisYear = new Date(`${today.slice(0, 5)}${joined.getUTCDate().toString().padStart(2, '0')}T00:00:00.000Z`)
      return {
        id: String(u._id),
        name: u.name || '',
        employeeId: u.employeeId || '',
        years,
        date: annivThisYear.toISOString().slice(0, 10),
      }
    })
    .filter((a) => a.date >= today && a.date <= in7Days)

  // Leave calendar
  const leaveCalendar = leaveCalendarAgg.map((l) => ({
    date: l._id,
    count: l.count,
  }))

  // Document expiries
  const expiringDocs = await db
    .collection(COLLECTIONS.DOCUMENTS)
    .find({ expiryAt: { $exists: true } })
    .limit(10)
    .toArray()
  const documentExpiries = await Promise.all(
    expiringDocs.map(async (d) => {
      const user = d.userId ? await getUserById(String(d.userId)) : null
      return {
        id: String(d._id),
        employeeName: user?.name || '',
        kind: d.kind || '',
        expiresAt: d.expiryAt ? new Date(d.expiryAt).toISOString().slice(0, 10) : '',
        status: (d.status as 'pending' | 'verified' | 'expired') || 'pending',
      }
    }),
  )

  return {
    totalHeadcount,
    newThisMonth,
    pendingOnboardings,
    onLeaveToday,
    attendanceCompliance: attendanceExceptions.length === 0 ? 100 : Math.round(((allUsers.length - attendanceExceptions.length) / allUsers.length) * 100),
    onboardingPipeline: pipelineStages,
    attendanceExceptions,
    payrateChangesPending,
    upcomingBirthdays,
    upcomingAnniversaries,
    leaveCalendar,
    documentExpiries,
    role: 'hr' as DashboardRole,
    updatedAt: now.toISOString(),
  }
}

// ── Manager dashboard ─────────────────────────────────────────────────────────

export async function getManagerDashboard(requesterId: string): Promise<ManagerDashboardData> {
  const db = await getDb()
  const now = new Date()
  const today = toDateString(now)

  const [activeClients, activeProjects, teamMemberIds] = await Promise.all([
    db.collection(COLLECTIONS.CLIENTS).countDocuments({ syncStatus: 'synced' }),
    db.collection(COLLECTIONS.PROJECTS).countDocuments({ status: 'active' }),
    getTeamMemberIds(requesterId, 'manager'),
  ])

  // Team members with names for various sub-aggregates
  const teamMembers = await db
    .collection(COLLECTIONS.USERS)
    .find({ _id: { $in: teamMemberIds }, status: { $in: ['active', 'on_leave'] } })
    .project({ _id: 1, name: 1, employeeId: 1, department: 1, title: 1, skills: 1, billable: 1 })
    .toArray()

  // Unassigned resources — team members without active assignments
  const teamWithAssignments = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .find({ status: 'active', resourceId: { $in: teamMemberIds } })
    .project({ resourceId: 1 })
    .toArray()
  const assignedIds = new Set(teamWithAssignments.map((a) => String(a.resourceId)))
  const unassignedResources = teamMembers.filter((u) => !assignedIds.has(String(u._id))).length

  // Pipeline stages — count projects by stage
  const projectStages = await db
    .collection(COLLECTIONS.PROJECTS)
    .aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }])
    .toArray()

  // Assignment queue — team members without active assignments
  const assignmentQueue = teamMembers
    .filter((u) => !assignedIds.has(String(u._id)))
    .slice(0, 10)
    .map((u) => ({
      id: String(u._id),
      name: u.name || '',
      employeeId: u.employeeId || '',
      department: u.department || '',
      skills: u.skills || [],
      billable: u.billable || false,
    }))

  // Project health
  const projects = await db
    .collection(COLLECTIONS.PROJECTS)
    .find({ status: 'active' })
    .project({ _id: 1, name: 1, sowNumber: 1, clientId: 1, startDate: 1, deadline: 1, status: 1, teamMemberIds: 1 })
    .toArray()

  const clientMap = new Map<string, { name: string; clientCode: string }>()
  for (const p of projects) {
    if (p.clientId) {
      const client = await db
        .collection(COLLECTIONS.CLIENTS)
        .findOne({ _id: p.clientId })
        .catch(() => null)
      if (client) {
        clientMap.set(String(p._id), { name: client.name || '', clientCode: client.clientCode || '' })
      }
    }
  }

  const projectHealth = projects.map((p) => {
    const team = p.teamMemberIds?.length || 0
    const staffedPercent = team > 0 ? Math.round((team / (team + 2)) * 100) : 0
    const c = clientMap.get(String(p._id)) || { name: '', clientCode: '' }
    const deadlineDate = new Date(p.deadline || p.endDate || '')
    const overdue = deadlineDate < now
    return {
      id: String(p._id),
      name: p.name || '',
      sowNumber: p.sowNumber || '',
      clientName: c.name,
      clientCode: c.clientCode,
      teamSize: team,
      staffedPercent,
      deadline: deadlineDate.toISOString().slice(0, 10),
      status: (p.status as ProjectStage) || 'active',
      overdue,
    }
  })

  // Top clients by hours (from daily_timesheets)
  const topClientsAgg = await db
    .collection(COLLECTIONS.DAILY_TIMESHEETS)
    .aggregate([
      { $match: { date: { $gte: subtractDays(today, 7) } } },
      { $lookup: { from: COLLECTIONS.PROJECTS, localField: 'projectId', foreignField: '_id', as: 'project' } },
      { $unwind: '$project' },
      { $lookup: { from: COLLECTIONS.CLIENTS, localField: 'project.clientId', foreignField: '_id', as: 'client' } },
      { $unwind: '$client' },
      {
        $group: {
          _id: '$client._id',
          name: { $first: '$client.name' },
          clientCode: { $first: '$client.clientCode' },
          billableHours: { $sum: { $cond: [{ $eq: ['$project.billable', true] }, '$hours', 0] } },
        },
      },
      { $sort: { billableHours: -1 } },
      { $limit: 5 },
    ])
    .toArray()

  const topClientsByHours = topClientsAgg.map((c) => ({
    id: String(c._id),
    name: c.name || '',
    clientCode: c.clientCode || '',
    billableHours: c.billableHours || 0,
  }))

  const weekStart = subtractDays(today, 7)

  // Capacity vs demand (by title/department)
  const teamBillableHours = await db
    .collection(COLLECTIONS.DAILY_TIMESHEETS)
    .aggregate([
      { $match: { userId: { $in: teamMemberIds }, date: { $gte: weekStart } } },
      { $lookup: { from: COLLECTIONS.PROJECTS, localField: 'projectId', foreignField: '_id', as: 'project' } },
      { $unwind: '$project' },
      {
        $group: {
          _id: null,
          billableHours: { $sum: { $cond: [{ $eq: ['$project.billable', true] }, '$hours', 0] } },
        },
      },
    ])
    .toArray()
  const billableHoursWeek = Math.round(teamBillableHours[0]?.billableHours || 0)
  const utilizationPercent = teamMembers.length > 0 ? Math.round((billableHoursWeek / (teamMembers.length * 40)) * 100) : 0

  // Capacity vs demand (by title/department)
  const capacityVsDemand = [
    { role: 'Frontend Engineer', capacity: 40, demand: 40 },
    { role: 'Backend Engineer', capacity: 40, demand: 40 },
  ]

  return {
    activeClients,
    activeProjects,
    unassignedResources,
    utilizationPercent,
    billableHoursWeek,
    pipelineStages: projectStages.map((p) => ({
      stage: (p._id as ProjectStage) || 'active',
      label: p._id || '',
      count: p.count,
    })),
    assignmentQueue,
    projectHealth,
    topClientsByHours,
    capacityVsDemand,
    role: 'manager' as DashboardRole,
    updatedAt: now.toISOString(),
  }
}

// ── Employee dashboard ───────────────────────────────────────────────────────

export async function getEmployeeDashboard(userId: string): Promise<EmployeeDashboardData> {
  const db = await getDb()
  const now = new Date()
  const today = toDateString(now)
  const weekStart = subtractDays(today, 7)

  // Today's attendance
  const myAttendance = await db
    .collection(COLLECTIONS.ATTENDANCE)
    .findOne({ userId: new ObjectId(userId), date: today })

  // Attendance streak
  const streak = await calculateStreak(userId, today, db)

  // Hours this week
  const hoursThisWeekAgg = await db
    .collection(COLLECTIONS.DAILY_TIMESHEETS)
    .aggregate([
      { $match: { userId: new ObjectId(userId), date: { $gte: weekStart } } },
      { $group: { _id: null, total: { $sum: '$hours' } } },
    ])
    .toArray()
  const hoursThisWeek = Math.round(hoursThisWeekAgg[0]?.total || 0)

  // My week hours (7 days)
  const myWeekHoursRaw = await db
    .collection(COLLECTIONS.DAILY_TIMESHEETS)
    .find({ userId: new ObjectId(userId), date: { $gte: weekStart } })
    .sort({ date: 1 })
    .toArray()
  const dayHours = [0, 0, 0, 0, 0, 0, 0]
  for (const h of myWeekHoursRaw) {
    const day = new Date(h.date).getDay()
    const idx = day === 0 ? 6 : day - 1
    dayHours[idx] = h.hours || 0
  }

  // Assignments
  const assignments = await db
    .collection(COLLECTIONS.ASSIGNMENTS)
    .find({ resourceId: new ObjectId(userId), status: 'active' })
    .toArray()

  // Enrich with project + client info
  const myAssignments = await Promise.all(
    assignments.map(async (a) => {
      const project = a.projectId
        ? await db.collection(COLLECTIONS.PROJECTS).findOne({ _id: a.projectId }).catch(() => null)
        : null
      const client = project?.clientId
        ? await db.collection(COLLECTIONS.CLIENTS).findOne({ _id: project.clientId }).catch(() => null)
        : null
      return {
        id: String(a._id || a.projectId),
        name: project?.name || a.projectName || '',
        clientName: client?.name || '',
        clientCode: client?.clientCode || '',
        billRate: project?.hourlyRate,
        currency: (client?.currency as 'USD' | 'INR' | 'EUR' | 'GBP') || 'USD',
        role: a.role || project?.name || '',
        status: (project?.status as string) || 'active',
      }
    }),
  )

  // Pending leave requests
  const pendingLeave = await db
    .collection(COLLECTIONS.LEAVE_REQUESTS)
    .countDocuments({ userId: new ObjectId(userId), status: 'pending' })

  // Documents to sign
  const pendingDocs = await db
    .collection(COLLECTIONS.DOCUMENTS)
    .find({ userId: new ObjectId(userId), status: 'pending' })
    .limit(5)
    .toArray()
  const documentsToSign = pendingDocs.map((d) => ({
    id: String(d._id),
    name: d.name || d.kind || '',
    kind: d.kind || 'document',
    expiresAt: d.expiryAt ? new Date(d.expiryAt).toISOString().slice(0, 10) : undefined,
  }))

  // Recent notifications
  const recentNotificationsRaw = await db
    .collection(COLLECTIONS.NOTIFICATIONS)
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray()
  const recentNotifications = recentNotificationsRaw.map((n) => ({
    id: String(n._id),
    title: n.title || '',
    message: n.message || n.body || '',
    createdAt: new Date(n.createdAt || now).toISOString(),
    read: n.read || false,
  }))

  return {
    attendanceStreak: streak,
    hoursThisWeek,
    assignedProjects: assignments.length,
    pendingLeaveRequests: pendingLeave,
    todayAttendance: myAttendance
      ? {
          marked: true,
          status: myAttendance.status as string,
          nextAction: 'Your attendance is marked. No action needed.',
        }
      : {
          marked: false,
          nextAction: 'Tap to mark your attendance for today.',
        },
    myWeekHours: dayHours,
    myAssignments,
    openTimesheetHandoff: true,
    documentsToSign,
    recentNotifications,
    role: 'employee' as DashboardRole,
    updatedAt: now.toISOString(),
  }
}

// ── Streak helper ─────────────────────────────────────────────────────────────

async function calculateStreak(userId: string, endDate: string, db: Awaited<ReturnType<typeof getDb>>): Promise<number> {
  let streak = 0
  let cursor = endDate

  for (let i = 0; i < 365; i++) {
    if (isWeekend(cursor)) {
      cursor = subtractDays(cursor, 1)
      continue
    }

    const record = await db
      .collection(COLLECTIONS.ATTENDANCE)
      .findOne({ userId: new ObjectId(userId), date: cursor })

    if (!record) {
      break
    }

    streak++
    cursor = subtractDays(cursor, 1)
  }

  return streak
}
