import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Lock, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardBody, CardHeader } from '../ui/Card'
import { ConfirmDialog } from '../ConfirmDialog'
import { DatePicker } from '../ui/DatePicker'
import { Input } from '../ui/Input'
import { Progress } from '../ui/Progress'
import { Select } from '../ui/Select'
import { Skeleton } from '../ui/Skeleton'
import { Textarea } from '../ui/Textarea'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { getOrgSettings } from '../../services/settingsService'
import {
  deleteDailyEntry,
  getDailyEntriesForWeek,
  saveDailyEntry,
  updateDailyEntry,
} from '../../services/timesheetService'
import { formatHours } from '../../utils/format'
import { formatWeekRange, getWeekDates, normalizeToMonday, toLocalDateString } from '../../utils/date'
import type { DailyTimesheet, TimesheetEntryType } from '../../types/timesheet'
import type { DayKey } from '../../types/project'

interface DailyEntryCardProps {
  className?: string
  /**
   * Called after a successful log/update/delete. Logging re-runs the backend's
   * weekly auto-compile, so the dashboard passes refreshTimesheets() here to
   * keep its weekly totals in sync.
   */
  onLogged?: () => void
}

// Mirrors backend/src/schemas/daily-timesheet.schema.ts — the widget must not
// invent rules (or allow values) the API will reject.
const WEEKEND_DAYS: DayKey[] = ['sat', 'sun']
const HOURS_MIN = 0.25
const HOURS_MAX = 24
/**
 * The Hours input's `step` must be exactly this. A native number input validates
 * against `min + n × step`, i.e. the legal grid is anchored on `min`: pairing
 * min=0.25 with step=0.5 lands it on 0.25/0.75 and turns every whole and half
 * hour into a stepMismatch ("the two nearest valid values are 7.75 and 8.25"),
 * which the browser reports before validate() below ever runs. Anchoring the grid
 * on the minimum with a quarter step makes the browser accept exactly what
 * validate() accepts: any quarter hour in [0.25, 24].
 */
const HOURS_INCREMENT = 0.25
const DESCRIPTION_MIN = 3
const DESCRIPTION_MAX = 1000
const DEFAULT_DAILY_HOURS = 8

const ENTRY_TYPE_OPTIONS = [
  { value: 'regular', label: 'Regular (Mon–Fri)' },
  { value: 'overtime', label: 'Overtime (Sat–Sun)' },
]

/**
 * Day of week for a YYYY-MM-DD string, parsed in UTC so the key never drifts
 * across a day boundary. Mirrors getDayOfWeekFromDateString on the backend.
 */
function dayKeyOf(dateStr: string): DayKey {
  const [year, month, day] = dateStr.split('-').map(Number)
  const index = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const keys: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return keys[index]
}

function isWeekendDate(dateStr: string): boolean {
  return WEEKEND_DAYS.includes(dayKeyOf(dateStr))
}

/**
 * apiClient throws Errors shaped "[CODE] message" (services/apiClient.ts). The
 * code is what lets the widget distinguish a Phase 5 lock conflict (409) from a
 * permission or validation failure.
 */
function splitApiError(err: unknown): { code: string; message: string } {
  const raw = err instanceof Error ? err.message : 'Something went wrong'
  const match = raw.match(/^\[([A-Z_]+)\]\s*(.*)$/)
  if (!match) return { code: 'UNKNOWN_ERROR', message: raw }
  return { code: match[1], message: match[2] || raw }
}

/**
 * ts.md Phase 6.3 — daily work logger. One form to record a day's hours against
 * a project, plus the day's logged total and a compact view of the week so an
 * employee can log time in seconds without opening the weekly matrix.
 *
 * Locking (ts.md Phase 5) is enforced by the backend: a day whose parent weekly
 * timesheet was submitted/approved is read-only, which arrives as a 409
 * CONFLICT. The widget pre-disables the controls when it can see a locked row
 * and still reports the server's refusal when its view was stale.
 */
export function DailyEntryCard({ className = '', onLogged }: DailyEntryCardProps) {
  const { user } = useAuth()
  const { projects } = useAppData()
  const { addToast } = useToast()

  const today = useMemo(() => toLocalDateString(new Date()), [])

  const [date, setDate] = useState(today)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [hoursInput, setHoursInput] = useState('')
  const [entryType, setEntryType] = useState<TimesheetEntryType>('regular')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [weekEntries, setWeekEntries] = useState<DailyTimesheet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DailyTimesheet | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [problems, setProblems] = useState<string[]>([])
  const [dailyTargetHours, setDailyTargetHours] = useState(DEFAULT_DAILY_HOURS)

  const reload = () => setReloadToken((token) => token + 1)
  const weekStart = useMemo(() => normalizeToMonday(date), [date])

  // Only projects the employee is actually on: backend validateProjectParticipation
  // accepts team membership (projects.teamMemberIds), which is the rule the rest
  // of the employee UI uses too. Entries seen for other projects stay selectable
  // so an existing row can still be corrected.
  const myProjects = useMemo(() => {
    if (!user) return []
    return projects.filter((project) => project.teamMemberIds.includes(user.id))
  }, [projects, user])

  // ts.md 6.3 — with exactly one project to log against there is nothing to
  // choose, so the selector (and the save payload) defaults to it. Derived
  // during render instead of synced in an effect, which would cascade a render.
  const projectId = selectedProjectId || (myProjects.length === 1 ? myProjects[0].id : '')

  // Weekly standard hours → its daily equivalent (5-day week), the same target
  // the weekly editor measures progress against.
  useEffect(() => {
    let cancelled = false
    async function loadTarget() {
      try {
        const settings = await getOrgSettings()
        if (!cancelled) setDailyTargetHours(Math.max(1, settings.standardWeeklyHours / 5))
      } catch {
        // Keep the 8h default when settings are unavailable.
      }
    }
    loadTarget()
    return () => { cancelled = true }
  }, [])

  // The selected week is fetched whole: the widget needs the day's rows for the
  // total/list and the other days for the week strip and the lock indicators.
  useEffect(() => {
    let cancelled = false
    async function loadEntries() {
      setIsLoading(true)
      try {
        const entries = await getDailyEntriesForWeek(weekStart)
        if (!cancelled) setWeekEntries(entries)
      } catch (err) {
        if (!cancelled) addToast('error', `Could not load your daily entries. ${splitApiError(err).message}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    loadEntries()
    return () => { cancelled = true }
  }, [weekStart, reloadToken, addToast])

  const dayEntries = useMemo(() => weekEntries.filter((entry) => entry.date === date), [weekEntries, date])
  const dayHours = useMemo(() => dayEntries.reduce((sum, entry) => sum + entry.hours, 0), [dayEntries])
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const editingEntry = useMemo(
    () => (editingId ? dayEntries.find((entry) => entry.id === editingId) ?? null : null),
    [dayEntries, editingId],
  )

  // Lock state is per project: the parent weekly timesheet is keyed by
  // (user, project, week), so one project's frozen week must not disable
  // another project's entry for the same day.
  const lockedProjects = useMemo(() => {
    const locked = new Set<string>()
    for (const entry of weekEntries) {
      if (entry.status === 'locked') locked.add(entry.projectId)
    }
    return locked
  }, [weekEntries])

  const lockedDates = useMemo(() => {
    const locked = new Set<string>()
    for (const entry of weekEntries) {
      if (entry.status === 'locked') locked.add(entry.date)
    }
    return locked
  }, [weekEntries])

  const projectOptions = useMemo(() => {
    const options = myProjects.map((project) => ({ value: project.id, label: project.name }))
    for (const entry of weekEntries) {
      if (options.some((option) => option.value === entry.projectId)) continue
      const project = projects.find((candidate) => candidate.id === entry.projectId)
      if (project) options.push({ value: project.id, label: project.name })
    }
    return options
  }, [myProjects, projects, weekEntries])

  const projectName = (id: string) => projects.find((project) => project.id === id)?.name || 'Unknown project'
  const hoursLoggedFor = (day: string) =>
    weekEntries.filter((entry) => entry.date === day).reduce((sum, entry) => sum + entry.hours, 0)

  const selectedProjectLocked = Boolean(projectId) && lockedProjects.has(projectId)
  const trackedHours = dayEntries
    .filter((entry) => entry.id !== editingId)
    .reduce((sum, entry) => sum + entry.hours, 0)
  const isOverTarget = dayHours > dailyTargetHours

  function resetForm() {
    setEditingId(null)
    setHoursInput('')
    setDescription('')
    setProblems([])
  }

  function handleDateChange(next: string) {
    setDate(next)
    // A form left open for another day would otherwise save against the wrong
    // date, so switching days always starts a fresh entry.
    resetForm()
    const nextType: TimesheetEntryType = isWeekendDate(next) ? 'overtime' : 'regular'
    if (nextType !== entryType) {
      setEntryType(nextType)
      addToast(
        'info',
        nextType === 'overtime'
          ? 'Weekend selected — entry type switched to Overtime (overtime is Sat–Sun only).'
          : 'Weekday selected — entry type switched to Regular (regular hours are Mon–Fri only).',
      )
    }
  }

  /**
   * Client-side mirror of the backend rules, so the user is told what is wrong
   * before a round-trip: project selection, hour range and increments,
   * description length, the Mon–Fri/Sat–Sun entry-type rule, and the 24h/day
   * cap that the backend applies across all of a user's entries.
   */
  function validate(): string[] {
    const found: string[] = []
    if (!projectId) found.push('Select a project to log hours against.')

    const hours = Number(hoursInput)
    if (!hoursInput.trim() || !Number.isFinite(hours)) {
      found.push(`Enter the hours you worked (${HOURS_MIN}–${HOURS_MAX}).`)
    } else {
      if (hours < HOURS_MIN || hours > HOURS_MAX) {
        found.push(`Hours must be between ${HOURS_MIN} and ${HOURS_MAX}.`)
      }
      if (Math.abs(hours * 4 - Math.round(hours * 4)) > 1e-9) {
        found.push(`Use ${HOURS_INCREMENT}-hour increments (for example 7.5 or 7.25).`)
      }
    }

    const trimmed = description.trim()
    if (trimmed.length < DESCRIPTION_MIN) {
      found.push(`Describe what you worked on (at least ${DESCRIPTION_MIN} characters).`)
    }
    if (trimmed.length > DESCRIPTION_MAX) {
      found.push(`The description cannot exceed ${DESCRIPTION_MAX} characters.`)
    }

    if (entryType === 'regular' && isWeekendDate(date)) {
      found.push('Regular hours are allowed Monday to Friday only — switch to Overtime.')
    }
    if (entryType === 'overtime' && !isWeekendDate(date)) {
      found.push('Overtime is allowed on Saturday and Sunday only — switch to Regular.')
    }

    if (Number.isFinite(hours) && trackedHours + hours > HOURS_MAX) {
      found.push(
        `That would log ${(trackedHours + hours).toFixed(2)}h on ${date}; the daily maximum is ${HOURS_MAX}h across all projects.`,
      )
    }
    return found
  }

  function startEdit(entry: DailyTimesheet) {
    setEditingId(entry.id)
    setSelectedProjectId(entry.projectId)
    setHoursInput(String(entry.hours))
    setEntryType(entry.entryType)
    setDescription(entry.description)
    setProblems([])
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return

    const found = validate()
    setProblems(found)
    if (found.length > 0) {
      addToast('error', 'Please fix the highlighted problems before saving.')
      return
    }

    const hours = Number(hoursInput)
    const trimmed = description.trim()
    setIsSaving(true)
    try {
      if (editingEntry) {
        await updateDailyEntry(editingEntry.id, { hours, entryType, description: trimmed })
        addToast('success', 'Daily entry updated')
      } else {
        // POST /timesheets/daily upserts on (user, project, date, entryType), so
        // logging the same day again corrects the existing entry instead of
        // creating a duplicate.
        await saveDailyEntry({ projectId, date, hours, entryType, description: trimmed })
        addToast('success', `Logged ${hours}h on ${date}`)
      }
      resetForm()
      reload()
      onLogged?.()
    } catch (err) {
      const { code, message } = splitApiError(err)
      addToast('error', message)
      // 409 = the week was submitted/approved while this form was open. Reload so
      // the day shows as locked instead of looking editable.
      if (code === 'CONFLICT') reload()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setIsDeleting(true)
    try {
      await deleteDailyEntry(pendingDelete.id)
      if (editingId === pendingDelete.id) resetForm()
      addToast('success', 'Daily entry deleted')
      setPendingDelete(null)
      reload()
      onLogged?.()
    } catch (err) {
      const { code, message } = splitApiError(err)
      addToast('error', message)
      setPendingDelete(null)
      if (code === 'CONFLICT') reload()
    } finally {
      setIsDeleting(false)
    }
  }

  const dayFullyLocked = dayEntries.length > 0 && dayEntries.every((entry) => entry.status === 'locked')

  return (
    <Card className={className}>
      <CardHeader
        dot
        title="Daily Work Logger"
        meta={formatWeekRange(weekStart, 6)}
        action={date !== today ? (
          <Button variant="ghost" size="sm" onClick={() => handleDateChange(today)}>Jump to today</Button>
        ) : undefined}
      />
      <CardBody className="space-y-5">
        {/* Week strip: hours already logged per day. Selecting a day moves the
            form to that date, so filling in a missed day is one tap away. */}
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((day) => {
            const iso = toLocalDateString(day.date)
            const logged = hoursLoggedFor(iso)
            const isSelected = iso === date
            const isLocked = lockedDates.has(iso)
            return (
              <button
                key={iso}
                type="button"
                onClick={() => handleDateChange(iso)}
                aria-pressed={isSelected}
                aria-label={`Log time for ${iso}`}
                className={`rounded-lg border px-1 py-2 text-center transition-colors ${isSelected ? 'border-accent bg-accent-soft' : 'border-border hover:bg-muted'}`}
              >
                <span className="block text-[11px] font-medium uppercase text-muted-foreground">
                  {day.label.split(',')[0]}
                </span>
                <span className={`mt-0.5 block text-sm font-semibold ${logged > 0 ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                  {logged > 0 ? logged.toFixed(1) : '—'}
                </span>
                {isLocked && <Lock className="mx-auto mt-0.5 h-3 w-3 text-destructive" aria-label="locked" />}
              </button>
            )
          })}
        </div>

        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {dayHours.toFixed(1)} / {dailyTargetHours.toFixed(1)} hrs logged
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {date === today ? 'Today' : date}
                {dayEntries.length > 0
                  ? ` · ${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'}`
                  : ' · no entries yet'}
              </p>
            </div>
            {dayFullyLocked && (
              <Badge variant="danger" size="sm" leftIcon={<Lock className="h-3 w-3" />}>Locked</Badge>
            )}
          </div>
          <Progress
            value={Math.min(dayHours, dailyTargetHours)}
            max={dailyTargetHours}
            variant={isOverTarget ? 'warning' : 'success'}
            className="mt-2"
          />
        </div>

        {dayEntries.length === 0 ? (
          isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hours logged for {date === today ? 'today' : date} yet — the form below takes seconds.
            </p>
          )
        ) : (
          <ul className="space-y-2">
            {dayEntries.map((entry) => {
              const isLocked = entry.status === 'locked'
              return (
                <li key={entry.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{formatHours(entry.hours)}</span>
                      <Badge variant={entry.entryType === 'overtime' ? 'warning' : 'info'} size="sm">
                        {entry.entryType === 'overtime' ? 'Overtime' : 'Regular'}
                      </Badge>
                      <span className="truncate text-sm text-foreground">{projectName(entry.projectId)}</span>
                      {isLocked && (
                        <Badge variant="danger" size="sm" leftIcon={<Lock className="h-3 w-3" />}>Locked</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      disabled={isLocked}
                      aria-label={`Edit the entry for ${projectName(entry.projectId)}`}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(entry)}
                      disabled={isLocked}
                      aria-label={`Delete the entry for ${projectName(entry.projectId)}`}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DatePicker label="Date" value={date} onChange={handleDateChange} />
            <Select
              label="Project"
              value={projectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              placeholder="Select a project"
              options={projectOptions}
            />
            <Input
              label="Hours"
              type="number"
              inputMode="decimal"
              min={HOURS_MIN}
              max={HOURS_MAX}
              step={HOURS_INCREMENT}
              value={hoursInput}
              onChange={(event) => setHoursInput(event.target.value)}
              placeholder="8"
              required
            />
            <Select
              label="Entry type"
              value={entryType}
              onChange={(event) => setEntryType(event.target.value as TimesheetEntryType)}
              options={ENTRY_TYPE_OPTIONS}
            />
          </div>

          <Textarea
            label="What did you work on today?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Implemented the invoice export and fixed the reporting query…"
            rows={3}
            maxLength={DESCRIPTION_MAX}
            showCount
          />

          {problems.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-error-soft px-3 py-2" role="alert">
              {problems.map((problem) => (
                <li key={problem} className="text-sm text-destructive">{problem}</li>
              ))}
            </ul>
          )}

          {selectedProjectLocked && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              {projectName(projectId)} is locked for the week of {formatWeekRange(weekStart, 6)} — that week was
              submitted or approved, so its days can no longer be edited.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {trackedHours > 0
                ? `${Math.max(0, HOURS_MAX - trackedHours).toFixed(2)}h left today (${HOURS_MAX}h cap across projects).`
                : 'Quarter-hour increments — 8, 7.5 or 7.25 are all valid.'}
            </p>
            <div className="flex items-center gap-2">
              {editingEntry && (
                <Button type="button" variant="secondary" onClick={resetForm} leftIcon={<X className="h-4 w-4" />}>
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                loading={isSaving}
                disabled={selectedProjectLocked}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                {editingEntry ? 'Update entry' : 'Log hours'}
              </Button>
            </div>
          </div>
        </form>
      </CardBody>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete daily entry?"
        message={
          pendingDelete
            ? `Remove the ${formatHours(pendingDelete.hours)} entry for ${projectName(pendingDelete.projectId)} on ${pendingDelete.date}?`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  )
}
