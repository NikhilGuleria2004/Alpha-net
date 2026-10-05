import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Users } from 'lucide-react'
import type { HeatmapDay } from '../../components/ems/AttendanceHeatmap'
import type { AttendanceRecord } from '../../types/attendance'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { getMyAttendanceRange } from '../../services/attendanceService'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { useToast } from '../../contexts/ToastContext'
import { toLocalDateString, formatDate } from '../../utils/date'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import { AttendanceClock } from '../../components/attendance/AttendanceClock'
import { RosterTable } from '../../components/attendance/RosterTable'
import { AttendanceHeatmap } from '../../components/ems/AttendanceHeatmap'

/** Resolved once at module scope so no `new Date()` runs during render. */
const TODAY = toLocalDateString(new Date())

/** Hours implied by a day's status — for the heatmap tooltip (§7.2). */
function hoursFor(status: AttendanceRecord['status']): number {
  switch (status) {
    case 'present':
    case 'remote':
    case 'late':
      return 8
    case 'half_day':
      return 4
    default:
      return 0
  }
}

/**
 * Attendance surface (EMSFrontend.md §7.2). One route per namespace — the page
 * adapts to the role via capabilities:
 *   - everyone who can mark: the Mark clock card + a personal heatmap;
 *   - everyone who can view the team: the oversight roster.
 * Admin has no markAttendance capability, so it lands on the roster only.
 */
export function AttendancePage() {
  const { user } = useAuth()
  const caps = usePermissions()
  const { addToast } = useToast()
  const today = TODAY

  const [history, setHistory] = useState<AttendanceRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(caps.viewOwnAttendance)
  const showHistory = useDelayedLoading(loadingHistory)

  useEffect(() => {
    if (!caps.viewOwnAttendance) return
    let cancelled = false
    setLoadingHistory(true)
    getMyAttendanceRange()
      .then((records) => {
        if (!cancelled) setHistory(records)
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load your history.')
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })
    return () => {
      cancelled = true
    }
  }, [caps.viewOwnAttendance, addToast])

  const heatmapDays: HeatmapDay[] = useMemo(
    () =>
      history.map((r) => ({ date: r.date, status: r.status, value: hoursFor(r.status) })),
    [history],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Attendance</h1>
          <p className="ems-text-label text-muted-foreground">{formatDate(today)} · {user?.name}</p>
        </div>
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
      </div>

      {caps.markAttendance && (
        <Card>
          <CardHeader title="Mark attendance" />
          <CardBody>
            <AttendanceClock date={today} />
          </CardBody>
        </Card>
      )}

      {caps.viewTeamAttendance && (
        <Card>
          <CardHeader title="Team oversight" />
          <CardBody>
            <RosterTable date={today} />
          </CardBody>
        </Card>
      )}

      {caps.viewOwnAttendance && (
        <Card>
          <CardHeader title="Your month" meta="Past 30 days" />
          <CardBody>
            {showHistory ? (
              <div className="py-8 text-center text-muted-foreground">Loading history…</div>
            ) : heatmapDays.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Users className="h-4 w-4" />
                No attendance history yet.
              </div>
            ) : (
              <AttendanceHeatmap days={heatmapDays} />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
