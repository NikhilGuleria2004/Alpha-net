import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Users } from 'lucide-react'
import type { AttendanceRecord } from '../../types/attendance'
import type { EmsUser } from '../../types/auth'
import { getTeamAttendance, getTeamHistoric, type TeamAttendanceResult } from '../../services/attendanceService'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { useToast } from '../../contexts/ToastContext'
import { toLocalDateString } from '../../utils/date'
import { Table } from '../ui/Table'
import { Avatar } from '../ui/Avatar'
import { RoleBadge } from '../ems/RoleBadge'
import { AttendanceStatusDot } from '../ems/AttendanceStatusDot'
import { StatusRail } from '../ems/StatusRail'
import { Card, CardHeader, CardBody } from '../ui/Card'

const HISTORY_DAYS = 7

/** Module-scope so no `new Date()` runs during render (react/purity). */
const TODAY = toLocalDateString(new Date())
const UPDATED = format(new Date(), 'h:mm a')

interface Row {
  user: EmsUser
  today: AttendanceRecord | null
  history: AttendanceRecord[]
}

/** Count consecutive "worked" days (present/remote/late/half_day) ending today. */
function computeStreak(history: AttendanceRecord[]): number {
  let streak = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const s = history[i].status
    if (s === 'present' || s === 'remote' || s === 'late' || s === 'half_day' || s === 'on_leave') streak++
    else break
  }
  return streak
}

interface RosterTableProps {
  /** Today's date as `YYYY-MM-DD`; defaults to the real current date. */
  date?: string
}

/**
 * Team attendance roster (EMSFrontend.md §7.2 oversight view). A KPI strip
 * (StatusRail) + a dense table: one row per markable employee, today's status,
 * a 7-day status spark, and a running streak. Fetches the team summary and the
 * 7-day history in parallel.
 */
export function RosterTable({ date }: RosterTableProps) {
  const today = date ?? TODAY
  const { addToast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [kpis, setKpis] = useState<TeamAttendanceResult['kpis'] | null>(null)
  const [loading, setLoading] = useState(true)
  const showLoading = useDelayedLoading(loading)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getTeamAttendance(today), getTeamHistoric(today, HISTORY_DAYS)])
      .then(([team, byUser]) => {
        if (cancelled) return
        const recordsByUser = new Map(team.records.map((r) => [r.userId, r]))
        // `members` comes from the team endpoint itself, which already resolved
        // the team. Reading names from GET /employees instead would 403 for a
        // manager — that route is admin/hr-only.
        const combined = (team.members ?? [])
          .map((member) => ({
            user: {
              id: member.id,
              name: member.name,
              email: member.email,
              employeeId: member.employeeId,
              department: member.department,
              role: member.role,
              avatarUrl: member.avatarUrl,
              status: 'active',
              billable: false,
            } as EmsUser,
            today: recordsByUser.get(member.id) ?? null,
            history: byUser[member.id] ?? [],
          }))
        setRows(combined)
        setKpis(team.kpis)
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load team attendance.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [today, addToast])

  const dates = useMemo(() => {
    const d = new Date(today)
    return Array.from({ length: HISTORY_DAYS }, (_, i) => {
      const dd = new Date(d)
      dd.setDate(dd.getDate() - (HISTORY_DAYS - 1 - i))
      return dd
    })
  }, [today])

  const columns = useMemo(
    () => [
      {
        key: 'employee',
        label: 'Employee',
        render: (row: Row) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.user.name} src={row.user.avatarUrl} size="sm" />
            <div className="min-w-0">
              <div className="font-medium text-foreground">{row.user.name}</div>
              <div className="ems-text-label text-muted-foreground">{row.user.employeeId}</div>
            </div>
            <RoleBadge role={row.user.role} size="sm" />
          </div>
        ),
      },
      {
        key: 'department',
        label: 'Department',
        render: (row: Row) => (
          <span className="text-sm text-foreground">{row.user.department ?? '—'}</span>
        ),
      },
      {
        key: 'today',
        label: 'Today',
        render: (row: Row) =>
          row.today ? (
            <AttendanceStatusDot status={row.today.status} showLabel />
          ) : (
            <span className="ems-text-label text-muted-foreground">Not marked</span>
          ),
      },
      ...dates.map((d) => ({
        key: `day-${d.toISOString().slice(0, 10)}`,
        label: format(d, 'EEE'),
        align: 'center' as const,
        render: (row: Row) => {
          const iso = format(d, 'yyyy-MM-dd')
          const rec = row.history.find((r) => r.date === iso)
          return rec ? <AttendanceStatusDot status={rec.status} /> : <span className="sr-only">No record</span>
        },
      })),
      {
        key: 'streak',
        label: 'Streak',
        align: 'right' as const,
        render: (row: Row) => <span className="ems-tabular font-medium text-foreground">{computeStreak(row.history)}d</span>,
      },
    ],
    [dates],
  )

  if (showLoading) {
    return (
      <Card>
        <CardBody>
          <div className="py-12 text-center text-muted-foreground">Loading team attendance…</div>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {kpis && (
        <StatusRail
          items={[
            { label: 'On site', value: kpis.on_site, tone: 'success' },
            { label: 'Remote', value: kpis.remote, tone: 'info' },
            { label: 'Late', value: kpis.late, tone: 'warning' },
            { label: 'On leave', value: kpis.on_leave, tone: 'info' },
            { label: 'Not marked', value: kpis.not_marked, tone: 'danger' },
          ]}
        />
      )}

      <Card>
          <CardHeader title="Team attendance" meta={`Updated ${UPDATED}`} />
        <CardBody className="p-0">
          <Table<Row> columns={columns} data={rows} emptyState={<span className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Users className="h-4 w-4" /> No team members to display.</span>} stickyHeader />
        </CardBody>
      </Card>
    </div>
  )
}

