/**
 * Typed mock adapter (EMSFrontend.md §9.3).
 *
 * Implements the same `ApiAdapter` contract as the real HTTP path, but resolves
 * every call against in-memory fixtures seeded from `mocks/fixtures.ts`. A
 * constant 250ms latency is applied so loading/skeleton states are exercised
 * for real (guide "Minimum loading-state duration").
 *
 * It is selected by the `api` switch in `apiClient.ts` when `VITE_USE_MOCK` is
 * `true` (the default for Phases 2–7). Phase 8 flips the flag and the whole
 * surface re-points at the real EMS Workers API with zero component changes —
 * because every service calls through `api` and this adapter speaks the same
 * endpoint + envelope contract.
 *
 * State this adapter owns (mock-only):
 *   - a persisted session (mirrors the httpOnly refresh-cookie) so `/auth/me`
 *     resolves across reloads (§3.2 bootstrap);
 *   - today's attendance marks, persisted so the daily gate (§3.5) survives a
 *     reload mid-demo.
 */
import type { ApiAdapter } from './apiClient'
import type { EmsUser } from '../types/auth'
import type { AttendanceRecord, AttendanceSummary, MarkAttendanceInput } from '../types/attendance'
import type { CreateUserInput, UpdateUserInput } from '../types/user'
import type { OnboardingCandidate, LeaveRequest, LeaveType } from '../types/hr'
import type { Assignment, CreateAssignmentInput } from '../types/assignment'
import type { CreateClientInput, Client } from '../types/client'
import type { Project, ProjectStatus } from '../types/project'
import type { ReportFilters } from '../types/report'
import { MOCK_USERS, MOCK_CLIENTS, MOCK_PROJECTS, MOCK_HEADCOUNT_TREND, MOCK_ATTENDANCE_RATE, MOCK_RECENT_AUDIT, MOCK_INTEGRATIONS, MOCK_UPCOMING_RENEWALS, MOCK_ROLE_DISTRIBUTION, MOCK_LATEST_ONBOARDINGS, MOCK_ONBOARDING_PIPELINE, MOCK_ATTENDANCE_EXCEPTIONS, MOCK_PENDRATE_CHANGES, MOCK_BIRTHDAYS, MOCK_ANNIVERSARIES, MOCK_LEAVE_CALENDAR, MOCK_DOCUMENT_EXPIRIES, MOCK_PROJECT_STATUS_DONUT, MOCK_TOP_CLIENTS_BY_HOURS, MOCK_CAPACITY_VS_DEMAND, MOCK_PIPELINE_STAGES, MOCK_ASSIGNMENT_QUEUE, MOCK_PROJECT_HEALTH, MOCK_MY_WEEK_HOURS, MOCK_MY_ASSIGNMENTS, MOCK_DOCUMENTS_TO_SIGN, MOCK_RECENT_NOTIFICATIONS, MOCK_DEPARTMENTS, MOCK_ONBOARDING_CANDIDATES, MOCK_LEAVE_REQUESTS, MOCK_PAYRATE_HISTORY, MOCK_DOCUMENTS, MOCK_LEAVE_TYPES, MOCK_ASSIGNMENTS, MOCK_CLIENT_BILLABLE_HOURS, MOCK_CLIENT_CONTRACT_VALUE, MOCK_PROJECT_DEMAND, MOCK_CLIENT_CONTACTS, MOCK_CLIENT_ACTIVITY, MOCK_PROJECT_TEAM, MOCK_PROJECT_DOCUMENTS, MOCK_HOURS_BY_PROJECT, MOCK_HOURS_BY_EMPLOYEE, MOCK_OVERTIME_STATS, MOCK_TIMESHEET_STATUS_BREAKDOWN, NOW } from '../mocks/fixtures'
import { MOCK_PAYROLL, MOCK_RATE_CHANGES, MOCK_NOTIFICATIONS } from '../mocks/fixtures2'
import { format, isWeekend, subDays } from 'date-fns'
import { toLocalDateString } from '../utils/date'

const LATENCY = 250
const SESSION_KEY = 'eniac_ems_mock_session'
const ATTENDANCE_KEY = 'eniac_ems_mock_attendance'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Session (mirrors the httpOnly refresh-cookie lifecycle) -----------------

function setSession(userId: string | null): void {
  if (!userId) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, userId)
}

function getSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY)
}

function currentSessionUser(): EmsUser | null {
  const id = getSessionId()
  return id ? MOCK_USERS.find((u) => u.id === id) ?? null : null
}

function findUser(email: string): EmsUser | undefined {
  return MOCK_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase())
}

// --- Attendance store (persisted marks keyed by `${userId}:${date}`) -----------

type AttendanceStore = Record<string, AttendanceRecord>

function loadAttendance(): AttendanceStore {
  try {
    return JSON.parse(localStorage.getItem(ATTENDANCE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveAttendance(store: AttendanceStore): void {
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(store))
}

function attKey(userId: string, date: string): string {
  return `${userId}:${date}`
}

function todayMarkableUsers(): EmsUser[] {
  // Everyone who can mark (non-admin, active). Admin is exempt (§6.2).
  return MOCK_USERS.filter((u) => u.status === 'active' && u.role !== 'admin')
}

/**
 * Seed today's marks on first contact each day: the session user is left
 * unmarked so the daily gate (§3.5) is demonstrable on login; the rest of the
 * team is marked with a deterministic spread of statuses. Existing persisted
 * marks always win so a user's choice is preserved.
 */
function ensureTodaySeeded(store: AttendanceStore, sessionUserId: string | null): void {
  const today = toLocalDateString(new Date())
  let dirty = false
  for (const u of todayMarkableUsers()) {
    const key = attKey(u.id, today)
    if (store[key]) continue
    if (u.id === sessionUserId) continue // gate stays open for the signing-in user
    dirty = true
    const roll = Math.abs(hashCode(u.id + today)) % 10
    const status: AttendanceRecord['status'] =
      roll < 6
        ? 'present'
        : roll < 7
          ? 'remote'
          : roll < 8
            ? 'late'
            : 'absent'
    store[key] = {
      id: `att-${u.id}-${today}`,
      userId: u.id,
      date: today,
      status,
      markedAt: `${today}T0${(roll % 9) + 1}:00:00.000Z`,
      note: undefined,
      location: undefined,
      source: 'system',
    }
  }
  if (dirty) saveAttendance(store)
}

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return h
}

/** Deterministic `daysBack`+ day history for a user, ending at `endDate` (today). */
function buildHistory(userId: string, userRole: EmsUser['role'], daysBack = 30, endDate: Date = new Date()): AttendanceRecord[] {
  const records: AttendanceRecord[] = []
  for (let i = daysBack; i >= 0; i--) {
    const d = subDays(endDate, i)
    const date = format(d, 'yyyy-MM-dd')
    if (isWeekend(d)) {
      records.push({
        id: `att-${userId}-${date}`,
        userId,
        date,
        status: 'weekend',
        markedAt: `${date}T00:00:00.000Z`,
        source: 'system',
      })
      continue
    }
    const roll = Math.abs(hashCode(userId + date)) % 10
    const status: AttendanceRecord['status'] =
      roll < 6
        ? 'present'
        : roll < 7
          ? 'remote'
          : roll < 8
            ? 'late'
            : 'absent'
    records.push({
      id: `att-${userId}-${date}`,
      userId,
      date,
      status,
      markedAt: `${date}T0${(roll % 9) + 1}:00:00.000Z`,
      source: 'self',
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void userRole
  return records
}

// --- Endpoint matching -------------------------------------------------------

function mockError(status: number, code: string, message: string): never {
  void status
  throw new Error(`[${code}] ${message}`)
}

/** Parse `pathname` + `searchParams` off a bare endpoint string like `/attendance/mine?date=2026-09-30`. */
function parseEndpoint(endpoint: string): { path: string; params: URLSearchParams } {
  const [path, search = ''] = endpoint.split('?')
  return { path, params: new URLSearchParams(search) }
}

/**
 * Prefix-match a dynamic route and extract path params.
 * `/employees/u-emp1` → { matched: true, params: { id: 'u-emp1' } }
 * `/employees/u-emp1?foo=bar` → path is already stripped of query by parseEndpoint.
 */
function matchPath(pattern: string, path: string): { matched: boolean; params: Record<string, string> } {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return { matched: false, params: {} }

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!
    const segment = pathParts[i] ?? ''
    if (p.startsWith(':')) {
      params[p.slice(1)] = segment
    } else if (p !== segment) {
      return { matched: false, params: {} }
    }
  }
  return { matched: true, params }
}

const mockAdapter: ApiAdapter = {
  get: async <T = unknown>(endpoint: string): Promise<T> => {
    await sleep(LATENCY)
    const { path, params } = parseEndpoint(endpoint)

    if (path === '/auth/me') {
      const user = currentSessionUser()
      if (!user) mockError(401, 'UNAUTHORIZED', 'No active session.')
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'No active session.')
      return { user: sessionUser } as T
    }

    if (path === '/attendance/mine') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view attendance.')
      const store = loadAttendance()
      ensureTodaySeeded(store, sessionUser.id)

      if (params.has('date')) {
        const date = params.get('date')!
        const record = store[attKey(sessionUser.id, date)]
        const summary: AttendanceSummary = record
          ? {
              userId: sessionUser.id,
              date,
              marked: true,
              status: record.status,
              markedAt: record.markedAt,
              streakDays: 7,
            }
          : { userId: sessionUser.id, date, marked: false, streakDays: 0 }
        return summary as T
      }

      // Range (heatmap history). Defaults to the last 30 days.
      const end = params.get('end') ?? toLocalDateString(new Date())
      const start = params.get('start') ?? format(subDays(new Date(end), 30), 'yyyy-MM-dd')
      const history = buildHistory(sessionUser.id, sessionUser.role, 31, new Date(end))
      const from = new Date(start)
      const to = new Date(end)
      const range = history.filter((r) => {
        const d = new Date(r.date)
        return d >= from && d <= to
      })
      return { records: range } as T
    }

    if (path === '/attendance/team/historic') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view team attendance.')
      const range = Number(params.get('range') ?? '7')
      const anchor = params.get('anchor') ?? toLocalDateString(new Date())
      const byUser: Record<string, AttendanceRecord[]> = {}
      for (const u of todayMarkableUsers()) {
        byUser[u.id] = buildHistory(u.id, u.role, range, new Date(anchor))
      }
      return { byUser } as T
    }

    if (path === '/attendance/team') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view team attendance.')
      const store = loadAttendance()
      ensureTodaySeeded(store, sessionUser.id)
      const date = params.get('date') ?? toLocalDateString(new Date())
      const scope = params.get('scope') // 'team' | 'department' | undefined

      const team = todayMarkableUsers()
      const records = team.map((u) => {
        const rec = store[attKey(u.id, date)]
        return rec ?? {
          id: `att-${u.id}-${date}`,
          userId: u.id,
          date,
          status: 'absent' as const,
          markedAt: '',
          source: 'system' as const,
        }
      })

      const kpis: Record<string, number> = {
        on_site: records.filter((r) => r.status === 'present').length,
        remote: records.filter((r) => r.status === 'remote').length,
        late: records.filter((r) => r.status === 'late').length,
        on_leave: records.filter((r) => r.status === 'on_leave').length,
        not_marked: team.filter((u) => !store[attKey(u.id, date)]).length,
      }

      void scope
      return { records, kpis } as T
    }

    // --- Dashboard aggregate endpoints (Phase 4, §7.3) ----------------------------
    if (path === '/dashboard/admin') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view the dashboard.')
      void sessionUser
      return {
        activeEmployees: { total: MOCK_USERS.length, billable: 3, nonBillable: 3 },
        openClientIds: MOCK_CLIENTS.length,
        activeProjects: MOCK_PROJECTS.filter((p) => p.status === 'active').length,
        attendanceToday: { present: 3, absent: 1, late: 1 },
        revenueAtRisk: { amount: 87500, currency: 'USD', projectCount: 2 },
        headcountTrend: MOCK_HEADCOUNT_TREND,
        attendanceRate: MOCK_ATTENDANCE_RATE,
        projectStatusDonut: MOCK_PROJECT_STATUS_DONUT,
        recentAudit: MOCK_RECENT_AUDIT,
        failedLogins: 5,
        integrations: MOCK_INTEGRATIONS,
        upcomingRenewals: MOCK_UPCOMING_RENEWALS,
        roleDistribution: MOCK_ROLE_DISTRIBUTION,
        latestOnboardings: MOCK_LATEST_ONBOARDINGS,
        updatedAt: NOW,
      } as T
    }

    if (path === '/dashboard/hr') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view the dashboard.')
      void sessionUser
      return {
        totalHeadcount: MOCK_USERS.length,
        newThisMonth: 2,
        pendingOnboardings: MOCK_ONBOARDING_PIPELINE.invited + MOCK_ONBOARDING_PIPELINE.docsPending + MOCK_ONBOARDING_PIPELINE.payratePending,
        onLeaveToday: 1,
        attendanceCompliance: 96,
        onboardingPipeline: MOCK_ONBOARDING_PIPELINE,
        attendanceExceptions: MOCK_ATTENDANCE_EXCEPTIONS,
        payrateChangesPending: MOCK_PENDRATE_CHANGES,
        upcomingBirthdays: MOCK_BIRTHDAYS,
        upcomingAnniversaries: MOCK_ANNIVERSARIES,
        leaveCalendar: MOCK_LEAVE_CALENDAR,
        documentExpiries: MOCK_DOCUMENT_EXPIRIES,
        updatedAt: NOW,
      } as T
    }

    if (path === '/dashboard/manager') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view the dashboard.')
      void sessionUser
      return {
        activeClients: MOCK_CLIENTS.filter((c) => c.syncStatus === 'synced').length,
        activeProjects: MOCK_PROJECTS.filter((p) => p.status === 'active').length,
        unassignedResources: 3,
        utilizationPercent: 78,
        billableHoursWeek: 320,
        pipelineStages: MOCK_PIPELINE_STAGES,
        assignmentQueue: MOCK_ASSIGNMENT_QUEUE,
        projectHealth: MOCK_PROJECT_HEALTH,
        topClientsByHours: MOCK_TOP_CLIENTS_BY_HOURS,
        capacityVsDemand: MOCK_CAPACITY_VS_DEMAND,
        updatedAt: NOW,
      } as T
    }


    if (path === '/dashboard/employee') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view the dashboard.')
      void sessionUser
      return {
        attendanceStreak: 12,
        hoursThisWeek: 30,
        assignedProjects: 2,
        pendingLeaveRequests: 1,
        todayAttendance: { marked: true, status: 'present', nextAction: 'Your attendance is marked. No action needed.' },
        myWeekHours: MOCK_MY_WEEK_HOURS,
        myAssignments: MOCK_MY_ASSIGNMENTS,
        openTimesheetHandoff: sessionUser.billable,
        documentsToSign: MOCK_DOCUMENTS_TO_SIGN,
        recentNotifications: MOCK_RECENT_NOTIFICATIONS,
        updatedAt: NOW,
      } as T
     }

    // --- HR endpoints (Phase 5, §7.4–7.5) ---------------------------------------
    if (path === '/employees') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view employees.')
      const query = params.get('q')?.toLowerCase() ?? ''
      let filtered = MOCK_USERS
      if (query) {
        filtered = filtered.filter(
          (u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || u.employeeId.includes(query),
        )
      }
      return { users: filtered, total: filtered.length } as T
    }

    const empMatch = matchPath('/employees/:id', path)
    if (empMatch.matched) {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view this employee.')
      const user = MOCK_USERS.find((u) => u.id === empMatch.params.id)
      if (!user) mockError(404, 'NOT_FOUND', 'Employee not found.')
      const payrateHistory = MOCK_PAYRATE_HISTORY.filter((p) => p.userId === user!.id)
      const documents = MOCK_DOCUMENTS.filter((d) => d.userId === user!.id)
      return { user, payrateHistory, documents } as T
    }

    if (path === '/onboarding/pipeline') {
      const visible = MOCK_ONBOARDING_CANDIDATES.filter((c) => !c.deletedAt)
      const pipeline = {
        invited: visible.filter((c) => c.stage === 'invited').length,
        docsPending: visible.filter((c) => c.stage === 'docs_pending').length,
        payratePending: visible.filter((c) => c.stage === 'payrate_pending').length,
        ready: visible.filter((c) => c.stage === 'ready').length,
        active: visible.filter((c) => c.stage === 'active').length,
      }
      return {
        pipeline,
        candidates: visible,
      } as T
    }

    if (path === '/departments') {
      return { departments: MOCK_DEPARTMENTS } as T
    }

    if (path === '/leave') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view leave requests.')
      const typeFilter = params.get('type')
      let filtered = MOCK_LEAVE_REQUESTS
      if (typeFilter) {
        filtered = filtered.filter((r) => r.type === typeFilter)
      }
      return { requests: filtered, total: filtered.length } as T
    }

    if (path === '/leave/types') {
      return { types: MOCK_LEAVE_TYPES } as T
    }

    if (path === '/documents') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view documents.')
      const typeFilter = params.get('type')
      let filtered = MOCK_DOCUMENTS
      if (typeFilter) {
        filtered = filtered.filter((d) => d.kind === typeFilter)
      }
      return { documents: filtered, total: filtered.length } as T
    }

    // --- Commercial endpoints (Phase 6, §7.6–7.7) -----------------------------
    if (path === '/clients') {
      return {
        clients: MOCK_CLIENTS.map((c) => ({
          ...c,
          projectCount: MOCK_PROJECTS.filter((p) => p.clientId === c.id).length,
          billableHoursMTD: MOCK_CLIENT_BILLABLE_HOURS[c.id] ?? 0,
          contractValue: MOCK_CLIENT_CONTRACT_VALUE[c.id] ?? 0,
        })),
        total: MOCK_CLIENTS.length,
      } as T
    }

    const clientMatch = matchPath('/clients/:id', path)
    if (clientMatch.matched) {
      const client = MOCK_CLIENTS.find((c) => c.id === clientMatch.params.id)
      if (!client) mockError(404, 'NOT_FOUND', 'Client not found.')
      const clientProjects = MOCK_PROJECTS.filter((p) => p.clientId === client!.id)
      return {
        client,
        projects: clientProjects,
        contacts: MOCK_CLIENT_CONTACTS[client!.id] ?? [],
        activity: MOCK_CLIENT_ACTIVITY,
      } as T
    }

    if (path === '/projects') {
      return {
        projects: MOCK_PROJECTS.map((p) => ({
          ...p,
          teamSize: p.teamMemberIds.length,
          staffedPercent: Math.round((p.teamMemberIds.length / 4) * 100),
        })),
        total: MOCK_PROJECTS.length,
      } as T
    }

    const projectMatch = matchPath('/projects/:id', path)
    if (projectMatch.matched) {
      const project = MOCK_PROJECTS.find((p) => p.id === projectMatch.params.id)
      if (!project) mockError(404, 'NOT_FOUND', 'Project not found.')
      const projectAssignments = MOCK_ASSIGNMENTS.filter((a) => a.projectId === project!.id)
      return {
        project,
        assignments: projectAssignments,
        team: MOCK_PROJECT_TEAM[project!.id as keyof typeof MOCK_PROJECT_TEAM] ?? [],
        documents: MOCK_PROJECT_DOCUMENTS[project!.id as keyof typeof MOCK_PROJECT_DOCUMENTS] ?? [],
      } as T
    }

    if (path === '/assignments') {
      return {
        assignments: MOCK_ASSIGNMENTS,
        total: MOCK_ASSIGNMENTS.length,
      } as T
    }

    if (path === '/assignments/demand') {
      return { demands: MOCK_PROJECT_DEMAND } as T
    }

    // --- Finance / Reports / Notifications (Phase 7, §7.8–7.10) ---------------
    if (path === '/payroll') {
      return {
        rows: MOCK_PAYROLL,
        rateChanges: MOCK_RATE_CHANGES,
        totalGross: MOCK_PAYROLL.reduce((sum, r) => sum + r.gross, 0),
        period: '2026-09',
      } as T
    }

    if (path === '/audit') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to view the audit log.')
      // Admin-only, mirroring the backend's `requireRole('admin')`.
      if (currentSessionUser()?.role !== 'admin') {
        mockError(403, 'FORBIDDEN', 'Admin access required')
      }
      // No `entityType` on the fixtures, so the type filter is a no-op here and
      // only paging is exercised. Kept so the URL-driven pager is testable.
      const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
      const limit = Math.min(100, Math.max(1, Number(params.get('limit') ?? '25') || 25))
      const total = MOCK_RECENT_AUDIT.length
      return {
        events: MOCK_RECENT_AUDIT.slice((page - 1) * limit, page * limit),
        total,
        page,
        limit,
      } as T
    }

    if (path === '/notifications') {
      return {
        notifications: MOCK_NOTIFICATIONS,
        unreadCount: MOCK_NOTIFICATIONS.filter((n) => !n.read).length,
      } as T
    }

    mockError(404, 'NOT_FOUND', `No mock GET handler for ${path}`)
  },

  post: async <T = unknown>(endpoint: string, body?: unknown): Promise<T> => {
    await sleep(LATENCY)
    const { path } = parseEndpoint(endpoint)

    if (path === '/auth/login') {
      const { email } = (body ?? {}) as { email: string; password: string }
      const user = findUser(email)
      if (!user) mockError(401, 'INVALID_CREDENTIALS', 'No account matches that email.')
      setSession(user.id)
      return { user, accessToken: `mock-access-${user.id}-${Date.now()}` } as T
    }

    if (path === '/auth/logout') {
      setSession(null)
      return undefined as T
    }

    if (path === '/auth/refresh') {
      const user = currentSessionUser()
      if (!user) mockError(401, 'UNAUTHORIZED', 'No active session.')
      return { accessToken: `mock-access-${user.id}-${Date.now()}` } as T
    }

    if (path === '/auth/forgot-password') {
      return undefined as T
    }

    if (path === '/auth/reset-password') {
      return undefined as T
    }

    if (path === '/auth/redeem-invite') {
      // The invite token is opaque in the mock; any non-empty token "redeems"
      // the seeded session user's account. Phase 3 only needs the surface.
      const { token } = (body ?? {}) as { token: string }
      if (!token) mockError(400, 'VALIDATION_ERROR', 'Invitation token is required.')
      const user = currentSessionUser() ?? MOCK_USERS[4] // fall back to the seeded employee.
      setSession(user.id)
      return { user, accessToken: `mock-access-${user.id}-${Date.now()}` } as T
    }

    if (path === '/attendance/mark') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to mark attendance.')
      const input = (body ?? {}) as MarkAttendanceInput & { date?: string }
      const today = input.date ?? toLocalDateString(new Date())
      const store = loadAttendance()
      const existing = store[attKey(sessionUser.id, today)]
      const record: AttendanceRecord = {
        id: existing?.id ?? `att-${sessionUser.id}-${today}`,
        userId: sessionUser.id,
        date: today,
        status: input.status,
        markedAt: existing?.markedAt ?? new Date().toISOString(),
        note: input.note,
        location: input.location,
        source: (existing?.source ?? 'self') as AttendanceRecord['source'],
      }
      store[attKey(sessionUser.id, today)] = record
      saveAttendance(store)
      return record as T
    }

    // --- HR POST handlers (Phase 5) ----------------------------------------------
    if (path === '/employees') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to create employees.')
      const input = (body ?? {}) as CreateUserInput
      const newId = `u-${Date.now()}`
      const newUser: EmsUser = {
        id: newId,
        name: input.name,
        email: input.email,
        employeeId: input.employeeId,
        department: input.department,
        role: input.role ?? 'employee',
        title: input.title,
        employmentType: input.employmentType,
        status: 'invited',
        billable: input.billable ?? input.role === 'employee',
        payRate: input.payRate ?? null,
        currency: input.currency ?? 'USD',
        managerId: input.managerId,
        supervisorId: input.supervisorId,
        createdAt: NOW,
        updatedAt: NOW,
      }
      // Mutate the mock array (Phase 5 — Phase 8 swaps for real API).
      MOCK_USERS.push(newUser)
      return { user: newUser, accessToken: `mock-access-${newId}-${Date.now()}` } as T
    }

    if (path === '/onboarding') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to start onboarding.')
      const input = (body ?? {}) as CreateUserInput
      const newId = `oc-${Date.now()}`
      const candidate: OnboardingCandidate = {
        id: newId,
        name: input.name,
        email: input.email,
        employeeId: input.employeeId,
        department: input.department,
        role: input.role,
        stage: 'invited',
        invitedAt: NOW,
        documentsUploaded: 0,
        documentsTotal: 3,
      }
      MOCK_ONBOARDING_CANDIDATES.push(candidate)
      return { candidate } as T
    }

    if (path === '/leave') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to request leave.')
      const input = (body ?? {}) as {
        type: string
        startDate: string
        endDate: string
        reason?: string
        note?: string
      }
      const startDate = new Date(input.startDate)
      const endDate = new Date(input.endDate)
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      const newRequest: LeaveRequest = {
        id: `lr-${Date.now()}`,
        userId: sessionUser.id,
        employeeName: sessionUser.name,
        type: input.type as LeaveType,
        startDate: input.startDate,
        endDate: input.endDate,
        days,
        status: 'pending',
        reason: input.reason,
        submittedAt: NOW,
        note: input.note,
      }
      MOCK_LEAVE_REQUESTS.unshift(newRequest)
      return { request: newRequest } as T
    }

    if (path === '/documents') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to upload documents.')
      void sessionUser
      return undefined as T
    }

    if (path === '/documents') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to upload documents.')
      void sessionUser
      return undefined as T
    }

    // --- Commercial POST handlers (Phase 6, §7.6–7.7) -------------------------
    if (path === '/clients') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to create clients.')
      const input = (body ?? {}) as CreateClientInput
      const newClient: Client = {
        ...input,
        id: `c-${Date.now()}`,
        clientCode: `CL-${new Date().getFullYear()}-${String(MOCK_CLIENTS.length + 1).padStart(3, '0')}`,
        normalizedName: input.name.toLowerCase(),
        syncStatus: 'pending',
        createdAt: NOW,
        updatedAt: NOW,
      }
      MOCK_CLIENTS.push(newClient)
      return { client: newClient } as T
    }

    if (path === '/projects') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to create projects.')
      const input = (body ?? {}) as {
        name: string
        clientId: string
        sowNumber: string
        poCap?: number
        startDate: string
        endDate: string
        deadline?: string
        description?: string
        skillsRequired?: string[]
        billRateDefault?: number
        status?: ProjectStatus
      }
      const newProject: Project = {
        ...input,
        id: `p-${Date.now()}`,
        status: input.status ?? 'draft',
        createdAt: NOW,
        updatedAt: NOW,
      } as Project
      MOCK_PROJECTS.push(newProject)
      return { project: newProject } as T
    }

    if (path === '/assignments') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to create assignments.')
      const input = (body ?? {}) as CreateAssignmentInput
      const newAssignment: Assignment = {
        ...input,
        id: `as-${Date.now()}`,
        clientId: MOCK_PROJECTS.find((p) => p.id === input.projectId)?.clientId ?? '',
        currency: input.currency ?? 'USD',
        payRate: input.payRate ?? 0,
        roleOnProject: input.roleOnProject ?? '',
        ftePercent: input.ftePercent ?? 100,
        status: 'proposed',
        timesheetEnabled: false,
        createdAt: NOW,
        updatedAt: NOW,
      } as Assignment
      MOCK_ASSIGNMENTS.push(newAssignment)
      return { assignment: newAssignment } as T
    }

    // --- Reports (Phase 7, §7.9) ----------------------------------------------
    if (path === '/reports/query') {
      const filters = (body ?? {}) as ReportFilters
      void filters
      return {
        hoursByProject: MOCK_HOURS_BY_PROJECT,
        hoursByEmployee: MOCK_HOURS_BY_EMPLOYEE,
        overtimeStats: MOCK_OVERTIME_STATS,
        statusBreakdown: MOCK_TIMESHEET_STATUS_BREAKDOWN,
      } as T
    }

    if (path === '/notifications/mark-all-read') {
      for (const n of MOCK_NOTIFICATIONS) {
        n.read = true
      }
      return undefined as T
    }

    mockError(404, 'NOT_FOUND', `No mock POST handler for ${path}`)
    return undefined as T
  },

  put: async <T = unknown>(endpoint: string, body?: unknown): Promise<T> => {
    void body
    await sleep(LATENCY)
    mockError(404, 'NOT_FOUND', `No mock PUT handler for ${endpoint}`)
  },

  patch: async <T = unknown>(endpoint: string, body?: unknown): Promise<T> => {
    await sleep(LATENCY)
    const { path } = parseEndpoint(endpoint)

    // Dynamic route: /leave/:id
    const leaveMatch = matchPath('/leave/:id', path)
    if (leaveMatch.matched) {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to update leave requests.')
      const input = (body ?? {}) as { status: string }
      const request = MOCK_LEAVE_REQUESTS.find((r) => r.id === leaveMatch.params.id)
      if (!request) mockError(404, 'NOT_FOUND', 'Leave request not found.')
      request!.status = input.status as LeaveRequest['status']
      request!.reviewedBy = sessionUser.name
      request!.reviewedAt = NOW
      return { request } as T
    }

    // Dynamic route: /employees/:id
    const empMatch = matchPath('/employees/:id', path)
    if (empMatch.matched) {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to update employees.')
      const input = (body ?? {}) as UpdateUserInput
      const user = MOCK_USERS.find((u) => u.id === empMatch.params.id)
      if (!user) mockError(404, 'NOT_FOUND', 'Employee not found.')

      if (input.payRate !== undefined && user.billable) {
        const oldRate = user.payRate ?? null
        const newRate = input.payRate
        user.payRate = newRate
        user.currency = input.currency ?? user.currency
        user.updatedAt = NOW
        MOCK_PAYRATE_HISTORY.unshift({
          id: `ph-${Date.now()}`,
          userId: user.id,
          employeeName: user.name,
          employeeId: user.employeeId,
          oldRate,
          newRate,
          currency: user.currency!,
          reason: 'Manual update',
          changedBy: sessionUser.name,
          createdAt: NOW,
        })
      }

      Object.assign(user, input)
      user.updatedAt = NOW
      return { user } as T
    }

    mockError(404, 'NOT_FOUND', `No mock PATCH handler for ${endpoint}`)
  },

  delete: async <T = unknown>(endpoint: string): Promise<T> => {
    await sleep(LATENCY)
    const { path, params } = parseEndpoint(endpoint)

    if (path === '/attendance/mine') {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to update attendance.')
      const date = params.get('date') ?? toLocalDateString(new Date())
      const store = loadAttendance()
      delete store[attKey(sessionUser.id, date)]
      saveAttendance(store)
      return undefined as T
    }

    const onboardingMatch = matchPath('/onboarding/:id', path)
    if (onboardingMatch.matched) {
      const sessionUser = currentSessionUser()
      if (!sessionUser) mockError(401, 'UNAUTHORIZED', 'Sign in to manage onboarding.')
      if (sessionUser.role !== 'admin' && sessionUser.role !== 'hr') {
        mockError(403, 'FORBIDDEN', 'Insufficient role')
      }
      const candidate = MOCK_ONBOARDING_CANDIDATES.find((c) => c.id === onboardingMatch.params.id)
      if (!candidate) mockError(404, 'NOT_FOUND', 'Onboarding candidate not found.')
      if (candidate!.stage === 'active') {
        mockError(409, 'CONFLICT', 'Candidate is already hired — remove the employee record instead.')
      }
      if (candidate!.deletedAt) {
        mockError(410, 'GONE', 'Onboarding candidate already deleted.')
      }
      candidate!.deletedAt = NOW
      candidate!.deletedBy = sessionUser.id
      return { ok: true, deletedId: candidate!.id, stage: candidate!.stage } as T
    }

    mockError(404, 'NOT_FOUND', `No mock DELETE handler for ${path}`)
  },
}

export { mockAdapter }
