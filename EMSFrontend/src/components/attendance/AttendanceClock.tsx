import { useEffect, useState, type FormEvent } from 'react'
import { addMinutes, format, formatDistanceToNow, isBefore } from 'date-fns'
import { Clock3, MapPin, Save, Undo2 } from 'lucide-react'
import type { AttendanceRecord, AttendanceStatus, MarkAttendanceInput, MarkableStatus } from '../../types/attendance'
import { getMyAttendance, markAttendance, unmarkAttendance } from '../../services/attendanceService'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { useToast } from '../../contexts/ToastContext'
import { toLocalDateString } from '../../utils/date'
import { AttendanceStatusDot } from '../ems/AttendanceStatusDot'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

const MARKABLE_STATUSES: { value: MarkableStatus; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'remote', label: 'Remote' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'half_day', label: 'Half day' },
]

const UNDO_WINDOW_MINUTES = 5

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  remote: 'Remote',
  late: 'Late',
  half_day: 'Half day',
  on_leave: 'On leave',
  absent: 'Absent',
  holiday: 'Holiday',
  weekend: 'Weekend',
}

interface AttendanceClockProps {
  /** Today's date as `YYYY-MM-DD`; defaults to the real current date (now). */
  date?: string
}

type ViewState = 'prompt' | 'marked'

/**
 * The "Mark Attendance" clock card (EMSFrontend.md §7.2). A live time display
 * (tabular), today's date, and a state machine:
 *
 *   prompt → (Mark) → marked (confirmation + 5-min Undo) → confirmed (read-only)
 *
 * Marking is optimistic: the confirmation renders immediately and the server call
 * runs in the background, rolling back on failure. The Undo retracts the same-day
 * mark via DELETE (mock persists it; real API honours a same-day window per §17
 * D-7). Native radio buttons are used for the status so arrow-key navigation and
 * screen-reader labelling are handled by the browser.
 */
export function AttendanceClock({ date }: AttendanceClockProps) {
  const [now, setNow] = useState<Date>(() => new Date())
  const today = date ?? toLocalDateString(now)
  const { addToast } = useToast()

  const [view, setView] = useState<ViewState>('prompt')
  const [loading, setLoading] = useState(true)
  const showLoading = useDelayedLoading(loading)

  const [status, setStatus] = useState<MarkableStatus>('present')
  const [note, setNote] = useState('')
  const [location, setLocation] = useState('')
  const [isMarking, setIsMarking] = useState(false)
  const [record, setRecord] = useState<AttendanceRecord | null>(null)
  // Deadline (markedAt + 5 min) during which the fresh mark is retractable.
  const [undoDeadline, setUndoDeadline] = useState<Date | null>(null)

  // Live clock — drives both the display and the Undo-window expiry so the
  // button disappears the instant 5 minutes elapse, not on an unrelated render.
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // On mount, read today's status so a return visit shows the right state.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const summary = await getMyAttendance(today)
        if (cancelled) return
        if (summary?.marked && summary.markedAt) {
          setRecord({
            id: `att-${today}`,
            userId: summary.userId,
            date: today,
            status: summary.status ?? 'present',
            markedAt: summary.markedAt,
            source: 'self',
          })
          setView('marked')
          const deadline = addMinutes(new Date(summary.markedAt), UNDO_WINDOW_MINUTES)
          setUndoDeadline(isBefore(now, deadline) ? deadline : null)
        } else {
          setView('prompt')
        }
      } catch {
        if (!cancelled) setView('prompt')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [today, now])

  const canUndo = undoDeadline !== null && isBefore(now, undoDeadline)

  const handleMark = async (event: FormEvent) => {
    event.preventDefault()
    const input: MarkAttendanceInput & { date?: string } = { status, note, location, date: today }
    // Optimistic commit: confirmation renders immediately.
    setRecord({
      id: `optimistic-${today}`,
      userId: '',
      date: today,
      status,
      markedAt: now.toISOString(),
      note,
      location,
      source: 'self',
    })
    setView('marked')
    setUndoDeadline(addMinutes(now, UNDO_WINDOW_MINUTES))
    setIsMarking(true)
    try {
      const result = await markAttendance(input)
      setRecord(result)
      addToast('success', `Attendance marked as ${MARKABLE_STATUSES.find((s) => s.value === status)?.label}.`)
    } catch (err) {
      // Rollback the optimistic commit.
      setView('prompt')
      setRecord(null)
      setUndoDeadline(null)
      addToast('error', err instanceof Error ? err.message : 'Could not mark attendance.')
    } finally {
      setIsMarking(false)
    }
  }

  const handleUndo = async () => {
    try {
      await unmarkAttendance(today)
      setView('prompt')
      setRecord(null)
      setUndoDeadline(null)
      addToast('success', 'Attendance entry removed.')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Could not remove the entry.')
    }
  }

  return (
    <div className="w-full max-w-lg">
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-5 ems-shadow-card">
        <Clock3 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="ems-overline text-muted-foreground">Time</p>
          <p className="ems-tabular text-2xl font-semibold text-foreground">{format(now, 'h:mm:ss a')}</p>
          <p className="ems-text-label text-muted-foreground">{format(now, 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      <div className="mt-4">
        {showLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-border bg-card py-10">
            <p className="text-sm text-muted-foreground">Loading today…</p>
          </div>
        ) : view === 'marked' && record ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <AttendanceStatusDot status={record.status} showLabel />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {STATUS_LABEL[record.status]} at {format(new Date(record.markedAt), 'h:mm a')}
                </p>
                <p className="ems-text-label text-muted-foreground">
                  {formatDistanceToNow(new Date(record.markedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
            {canUndo && (
              <Button variant="ghost" size="sm" leftIcon={<Undo2 className="h-4 w-4" />} onClick={handleUndo}>
                Undo
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={handleMark} className="space-y-4" noValidate>
            <fieldset className="space-y-2" aria-label="Mark attendance status">
              <legend className="ems-text-label font-medium text-foreground">Status</legend>
              <div
                role="radiogroup"
                aria-label="Attendance status"
                className="flex flex-wrap gap-2 focus-within:outline-none focus-within:ring-2 focus-within:ring-accent"
              >
                {MARKABLE_STATUSES.map((option) => {
                  const selected = status === option.value
                  return (
                    <label
                      key={option.value}
                      className={`ems-row flex items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
                        selected ? 'border-accent bg-accent-soft text-accent' : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={option.value}
                        checked={selected}
                        onChange={() => setStatus(option.value)}
                        className="sr-only"
                        aria-label={option.label}
                      />
                      <AttendanceStatusDot status={option.value} />
                      <span className="sr-only">{option.label}</span>
                      <span aria-hidden="true">{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <Input label="Note (optional)" placeholder="e.g. working from the client site" value={note} onChange={(e) => setNote(e.target.value)} />
            <Input
              label="Location (optional)"
              placeholder="e.g. Bangalore office"
              leftIcon={<MapPin className="h-4 w-4" />}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            <Button type="submit" className="w-full" loading={isMarking} disabled={isMarking} leftIcon={<Save className="h-4 w-4" />}>
              {isMarking ? 'Marking…' : 'Mark attendance'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
