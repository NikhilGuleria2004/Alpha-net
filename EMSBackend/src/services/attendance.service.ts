import { ObjectId } from 'mongodb'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { resolveEmsRole } from '../lib/role.js'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import type {
  AttendanceRecord,
  AttendanceSummary,
  MarkAttendanceInput,
  TeamAttendanceKpi,
  TeamAttendanceResult,
  AttendanceStatus,
} from '../types/attendance.js'
import type { UserRole } from '../types/auth.js'

/** YYYY-MM-DD string. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dateToISOString(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00.000Z`
}

/** Subtract N days from a YYYY-MM-DD string, returning YYYY-MM-DD. */
function subtractDays(yyyyMmDd: string, days: number): string {
  const d = new Date(dateToISOString(yyyyMmDd))
  d.setUTCDate(d.getUTCDate() - days)
  return toDateString(d)
}

/** Whether a YYYY-MM-DD date is a weekend (Sat/Sun). */
function isWeekendDate(yyyyMmDd: string): boolean {
  const d = new Date(dateToISOString(yyyyMmDd))
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

/** Build a frontend-shape AttendanceRecord from a raw DB row. */
function dbToRecord(doc: Record<string, unknown>): AttendanceRecord {
  return {
    id: doc._id ? String(doc._id) : '',
    userId: doc.userId ? String(doc.userId) : '',
    date: typeof doc.date === 'string' ? doc.date : '',
    status: (doc.status as AttendanceStatus) ?? 'present',
    markedAt: doc.markedAt ? new Date(doc.markedAt as Date).toISOString() : '',
    note: typeof doc.note === 'string' && doc.note ? doc.note : undefined,
    location: typeof doc.location === 'string' && doc.location ? doc.location : undefined,
    source: (doc.source as AttendanceRecord['source']) ?? 'system',
  }
}

/**
 * Upsert one attendance mark per user per day (§5.2 unique (userId, date)).
 * Uses findOneAndUpdate with upsert so concurrent marks resolve to a single row.
 */
export async function markAttendance(
  userId: string,
  input: MarkAttendanceInput & { date?: string },
): Promise<AttendanceRecord> {
  const db = await getDb()
  const userOid = new ObjectId(userId)
  const date = input.date ?? toDateString(new Date())
  const now = new Date()

  const result = await db
    .collection(COLLECTIONS.ATTENDANCE)
    .findOneAndUpdate(
      { userId: userOid, date },
      {
        $set: {
          userId: userOid,
          status: input.status as string,
          note: input.note ?? null,
          location: input.location ?? null,
          source: 'self',
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          markedAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    )

  // Driver v6 returns the document itself; the `{ value }` wrapper only exists
  // in v5 or when includeResultMetadata is requested. Reading `.value` here
  // yielded undefined and turned *every* successful mark into a 500 — the unit
  // tests missed it because their mock reproduced the old wrapper shape.
  const doc = result
  if (!doc) {
    throw new Error('Failed to record attendance')
  }

  logger.info({ userId, date, status: input.status }, 'attendance marked')
  void createActivity({
    userId,
    description: `Attendance marked: ${input.status}`,
    entityType: 'attendance',
    entityId: String(doc._id),
  }).catch(() => {})

  return dbToRecord(doc as Record<string, unknown>)
}

/**
 * Return today's / a date's attendance summary for the requesting user.
 * Returns null when the user has not marked on that date.
 */
export async function getMyAttendance(userId: string, date: string): Promise<AttendanceSummary> {
  const db = await getDb()
  const userOid = new ObjectId(userId)

  const record = await db
    .collection(COLLECTIONS.ATTENDANCE)
    .findOne({ userId: userOid, date })

  if (!record) {
    return {
      userId,
      date,
      marked: false,
      streakDays: 0,
    }
  }

  const streak = await calculateStreak(userId, date)
  return {
    userId,
    date,
    marked: true,
    status: record.status as AttendanceStatus,
    markedAt: new Date(record.markedAt as Date).toISOString(),
    streakDays: streak,
  }
}

/**
 * Return the user's own attendance records over a date range (default: last 30 days).
 */
export async function getMyAttendanceRange(userId: string, start?: string, end?: string): Promise<AttendanceRecord[]> {
  const db = await getDb()
  const userOid = new ObjectId(userId)
  const today = toDateString(new Date())
  const from = start ?? subtractDays(today, 30)
  const to = end ?? today

  const docs = await db
    .collection(COLLECTIONS.ATTENDANCE)
    .find({
      userId: userOid,
      date: { $gte: from, $lte: to },
    })
    .sort({ date: 1 })
    .toArray()

  return docs.map((doc) => dbToRecord(doc as Record<string, unknown>))
}

/**
 * Delete (retract) the requesting user's mark for a given date.
 */
export async function deleteMyAttendance(userId: string, date: string): Promise<void> {
  const db = await getDb()
  const userOid = new ObjectId(userId)

  await db.collection(COLLECTIONS.ATTENDANCE).deleteOne({ userId: userOid, date })

  logger.info({ userId, date }, 'attendance retracted')
}

/**
 * Consecutive marked days ending at (and including) endDate, skipping weekends.
 */
async function calculateStreak(userId: string, endDate: string): Promise<number> {
  const db = await getDb()
  const userOid = new ObjectId(userId)

  let streak = 0
  let cursor = endDate

  for (let i = 0; i < 365; i++) {
    if (isWeekendDate(cursor)) {
      cursor = subtractDays(cursor, 1)
      continue
    }

    const record = await db.collection(COLLECTIONS.ATTENDANCE).findOne({ userId: userOid, date: cursor })

    if (!record) {
      break
    }

    streak++
    cursor = subtractDays(cursor, 1)
  }

  return streak
}

/**
 * Resolve the set of user IDs the requester can see in team views.
 * - admin / hr: all active, non-admin users
 * - manager: users whose managerId === requester
 * - supervisor: users whose supervisorId === requester
 * - employee: own ID only
 *
 * Exported so other routers (assignments team-scoped read) reuse the one
 * definition instead of re-deriving team membership.
 */
export async function getTeamMemberIds(requesterId: string, role: UserRole): Promise<ObjectId[]> {
  const db = await getDb()
  const requesterOid = new ObjectId(requesterId)

  if (role === 'admin' || role === 'hr') {
    const users = await db
      .collection(COLLECTIONS.USERS)
      .find({ status: { $in: ['active', 'on_leave'] }, role: { $ne: 'admin' } })
      .project({ _id: 1 })
      .toArray()
    return users.map((u) => u._id as ObjectId)
  }

  if (role === 'manager') {
    const users = await db
      .collection(COLLECTIONS.USERS)
      .find({ status: { $in: ['active', 'on_leave'] }, managerId: requesterOid })
      .project({ _id: 1 })
      .toArray()
    return users.map((u) => u._id as ObjectId)
  }

  return [requesterOid]
}

/** One roster entry: enough to render a table row without a directory call. */
export interface TeamMemberSummary {
  id: ObjectId
  name: string
  email: string
  employeeId: string
  department: string
  role: string
  avatarUrl: string
}

/** Wire shape of a team member (ids stringified for JSON). */
export interface TeamMemberDto {
  id: string
  name: string
  email: string
  employeeId: string
  department: string
  role: string
  avatarUrl: string
}

function toTeamMemberDto(m: TeamMemberSummary): TeamMemberDto {
  return { ...m, id: m.id.toString() }
}

/**
 * Team members with just enough detail to render a roster row.
 *
 * `getTeamMemberIds` returns ids only, which forced the frontend to call
 * `GET /employees` for names — but that route is admin/hr-only while the
 * attendance team view is also open to manager. A manager's
 * roster therefore 403'd on its own name lookup. Resolving the name here keeps
 * one request and works for every role allowed to see the roster.
 */
export async function getTeamMemberSummaries(
  requesterId: string,
  role: UserRole,
): Promise<Array<TeamMemberSummary>> {
  const db = await getDb()
  const ids = await getTeamMemberIds(requesterId, role)
  if (ids.length === 0) return []
  const users = await db
    .collection(COLLECTIONS.USERS)
    .find({ _id: { $in: ids } })
    .project({ name: 1, email: 1, employeeId: 1, department: 1, role: 1, emsRole: 1, avatarUrl: 1 })
    .toArray()
  const byId = new Map(users.map((u) => [u._id.toString(), u]))
  return ids.map((id) => {
    const u = byId.get(id.toString())
    return {
      id,
      name: (u?.name as string) || 'Unknown',
      email: (u?.email as string) || '',
      employeeId: (u?.employeeId as string) || '',
      department: (u?.department as string) || '',
      // The roster shows a role badge, so it needs the *effective* EMS role —
      // a platform `user` must read as "Employee", not as an unknown value.
      role: resolveEmsRole(u),
      avatarUrl: (u?.avatarUrl as string) || '',
    }
  })
}

/**
 * Team attendance overview for a given date, with KPI derivation.
 * Every team member appears in `records` — unmarked users get a system "absent"
 * placeholder. `not_marked` counts those without a stored record.
 */
export async function getTeamAttendance(
  requesterId: string,
  role: UserRole,
  date: string,
): Promise<TeamAttendanceResult> {
  const db = await getDb()
  const members = await getTeamMemberSummaries(requesterId, role)

  const records: AttendanceRecord[] = []
  const kpis: TeamAttendanceKpi = {
    on_site: 0,
    remote: 0,
    late: 0,
    on_leave: 0,
    not_marked: 0,
  }

  for (const member of members) {
    const oid = member.id
    const userIdStr = oid.toString()
    const record = await db
      .collection(COLLECTIONS.ATTENDANCE)
      .findOne({ userId: oid, date })

    if (record) {
      const rec = dbToRecord(record as Record<string, unknown>)
      records.push(rec)
      switch (rec.status) {
        case 'present':
          kpis.on_site++
          break
        case 'remote':
          kpis.remote++
          break
        case 'late':
          kpis.late++
          break
        case 'on_leave':
          kpis.on_leave++
          break
      }
    } else {
      records.push({
        id: `absent-${userIdStr}-${date}`,
        userId: userIdStr,
        date,
        status: 'absent',
        markedAt: '',
        source: 'system',
      })
      kpis.not_marked++
    }
  }

  return { records, kpis, members: members.map(toTeamMemberDto) }
}

/**
 * Per-user attendance history for the heatmap (last-N-days ending at anchorDate).
 */
export async function getTeamHistoric(
  requesterId: string,
  role: UserRole,
  range: number,
  anchorDate: string,
): Promise<Record<string, AttendanceRecord[]>> {
  const db = await getDb()
  const startDate = subtractDays(anchorDate, range - 1)
  const memberIds = await getTeamMemberIds(requesterId, role)

  const byUser: Record<string, AttendanceRecord[]> = {}

  for (const oid of memberIds) {
    const userIdStr = oid.toString()
    const docs = await db
      .collection(COLLECTIONS.ATTENDANCE)
      .find({
        userId: oid,
        date: { $gte: startDate, $lte: anchorDate },
      })
      .sort({ date: 1 })
      .toArray()

    byUser[userIdStr] = docs.map((doc) => dbToRecord(doc as Record<string, unknown>))
  }

  return byUser
}
