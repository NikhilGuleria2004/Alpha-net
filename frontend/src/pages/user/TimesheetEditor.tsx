import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, Save, Send, Edit3, RefreshCw, AlertTriangle, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Textarea } from '../../components/ui/Textarea'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { addWeeks, formatWeekRange, getWeekDates, parseLocalDate, toLocalDateString } from '../../utils/date'
import { createEntryId } from '../../utils/id'
import { formatHours } from '../../utils/format'
import { getOrgSettings } from '../../services/settingsService'
import { compileWeeklyTimesheet, getDailyEntriesForWeek } from '../../services/timesheetService'
import type { DailyTimesheet, Timesheet, TimesheetEntry } from '../../types/timesheet'
import type { DayKey } from '../../types/project'
import { failureMessage, failureText } from '../../utils/errorMessage'

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

// Stable empty array so `dailyEntries ?? EMPTY_DAILY_ROWS` keeps referential
// identity across renders (the daily-row useMemo below depends on it).
const EMPTY_DAILY_ROWS: DailyTimesheet[] = []

// Mirror the backend day-of-week rules (backend/src/services/timesheet.service.ts:84-116):
// regular entries are Mon–Fri only, overtime entries are Sat–Sun only, max 24h/day.
const REGULAR_DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const OVERTIME_DAYS: DayKey[] = ['sat', 'sun']
const MAX_DAILY_HOURS = 24

// F-03: this file used to declare its own ConfirmDialog and WithdrawModal, both
// hand-rolled role="dialog" overlays with no accessible name, no focus trap and
// no Escape handling. Both now render the shared components, whose focus
// contract lives in src/hooks/useFocusTrap.ts.
function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <ul className="mt-3 space-y-1 rounded-lg bg-warning-soft px-3 py-2">
      {warnings.map((warning) => (
        <li key={warning} className="text-xs leading-relaxed text-warning">{warning}</li>
      ))}
    </ul>
  )
}

export function TimesheetEditor() {
  const { timesheetId } = useParams<{ timesheetId: string }>()
  const { user } = useAuth()
  const { timesheets, projects: appProjects, saveDraft, submitTimesheet, withdrawTimesheet, createTimesheet, refreshTimesheets } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()

  const existingTimesheet = timesheets.find((t) => t.id === timesheetId)
  const project = existingTimesheet ? appProjects.find((p) => p.id === existingTimesheet.projectId) : null

  const [entries, setEntries] = useState<TimesheetEntry[]>(() => {
    if (existingTimesheet) {
      return existingTimesheet.entries.map((e) => ({ ...e, hours: { ...e.hours } }))
    }
    return [{ id: createEntryId(), description: '', entryType: 'regular', hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } }]
  })
  const [notes, setNotes] = useState(() => existingTimesheet?.notes || '')
  const [weekStart] = useState(() => existingTimesheet?.weekStart || (() => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(today.setDate(diff))
    return toLocalDateString(monday)
   })())
  const [status] = useState<Timesheet['status']>(() => existingTimesheet?.status || 'draft')
  const [isSubmitOpen, setIsSubmitOpen] = useState(false)
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isNavigatingWeek, setIsNavigatingWeek] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [weeklyTarget, setWeeklyTarget] = useState(40)
  // ts.md Phase 7.1/7.2 — daily logs for the open week (read-only here;
  // editing/deleting happens in the Daily Work Logger on the dashboard).
  const [dailyEntries, setDailyEntries] = useState<DailyTimesheet[] | null>(null)
  const [trayOverrides, setTrayOverrides] = useState<Partial<Record<DayKey, boolean>>>({})
  const [isCompiling, setIsCompiling] = useState(false)
  const [isCompileConfirmOpen, setIsCompileConfirmOpen] = useState(false)
  // Bumped after a compile to re-fetch the daily rows (their linkage/status
  // changes server-side when the parent is rebuilt).
  const [dailyTick, setDailyTick] = useState(0)

  // Guideline 5.15 → interface_guide.txt:93 ("Unsaved changes"): the editor is dirty when the working
  // copy differs from the last saved state. The hook covers tab close/refresh
  // (beforeunload) and in-app navigation (useBlocker); the returned blocker is
  // rendered as a confirm dialog below.
  //
  // savedSnapshot is state (not a mount-time memo): refreshTimesheets() swaps
  // the context object identity on every save, so snapshotting existingTimesheet
  // directly would false-positive. Instead the snapshot is re-based explicitly
  // after each successful save/submit via rebaseSavedSnapshot().
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({
      entries: existingTimesheet?.entries.map((e) => ({ ...e, hours: { ...e.hours } })) ?? null,
      notes: existingTimesheet?.notes ?? '',
    }),
  )
  // ts.md 7.3 — the guard compares the working copy against the last-known
  // saved snapshot. A full save (draft/submit/withdraw) re-bases both halves;
  // a compile persists only the rows server-side, so rebaseSavedRows() re-bases
  // the rows half alone — rows modified by a compile then never trip the
  // blocker, while notes edited locally stay flagged as dirty.
  const rebaseSavedSnapshot = (nextEntries: TimesheetEntry[] = entries, nextNotes: string = notes) =>
    setSavedSnapshot(JSON.stringify({ entries: nextEntries, notes: nextNotes }))
  const rebaseSavedRows = (nextEntries: TimesheetEntry[]) =>
    setSavedSnapshot((prev) => {
      try {
        const parsed = JSON.parse(prev) as { entries: TimesheetEntry[] | null; notes: string }
        return JSON.stringify({ entries: nextEntries, notes: parsed.notes ?? '' })
      } catch {
        // Fail toward false-dirty (block navigation) rather than falsely-clean.
        return JSON.stringify({ entries: nextEntries, notes: '' })
      }
    })
  const currentSnapshot = JSON.stringify({ entries, notes })
  // isReadOnly is declared below (derived from status); inline the same check
  // here to avoid a use-before-declaration error.
  const isDirty = status !== 'approved' && existingTimesheet != null && currentSnapshot !== savedSnapshot
  const unsavedBlocker = useUnsavedChanges(isDirty)

  useEffect(() => {
    let cancelled = false
    async function loadTarget() {
      try {
        const settings = await getOrgSettings()
        if (!cancelled) setWeeklyTarget(settings.standardWeeklyHours)
      } catch {
        // keep the 40h default if settings can't be loaded
      }
    }
    loadTarget()
    return () => { cancelled = true }
  }, [])

  // ts.md 7.1 — fetch this week's daily rows; re-runs when the week or project
  // changes and after a compile (dailyTick) to pick up fresh linkage/status.
  const projectId = existingTimesheet?.projectId ?? null
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    getDailyEntriesForWeek(weekStart, projectId)
      .then((rows) => {
        if (!cancelled) setDailyEntries(rows)
      })
      .catch((err) => {
        if (!cancelled) {
          addToast('error', failureMessage(err, { what: 'load your daily logs', reassurance: 'The weekly grid is unchanged', next: 'try again' }))
        }
      })
    return () => { cancelled = true }
  }, [weekStart, projectId, dailyTick, addToast])

  // ts.md 7.2: parameterized so the submit flow can validate the *compiled*
  // rows (post-compile) rather than the possibly-stale pre-compile grid.
  const getValidationErrors = (rows: TimesheetEntry[] = entries) => {
    const errors: string[] = []
    if (rows.length === 0) {
      errors.push('Add at least one work item.')
    }
    rows.forEach((entry) => {
      // H2 (QA.md): mirror backend validateEntries — regular = Mon–Fri only,
      // overtime = Sat–Sun only — so the editor catches day-rule violations
      // inline instead of relying on the backend to reject the save.
      if (entry.entryType === 'regular') {
        for (const day of OVERTIME_DAYS) {
          const hours = entry.hours[day]
          if (hours > 0) {
            errors.push(`Regular entry "${entry.description}" has hours on ${day} (${hours}\u00a0h). Regular entries must be Mon-Fri only.`)
          }
        }
      } else if (entry.entryType === 'overtime') {
        for (const day of REGULAR_DAYS) {
          const hours = entry.hours[day]
          if (hours > 0) {
            errors.push(`Overtime entry "${entry.description}" has hours on ${day} (${hours}\u00a0h). Overtime entries must be Sat-Sun only.`)
          }
        }
      }
      for (const day of DAYS) {
        const hours = entry.hours[day]
        if (!Number.isFinite(hours) || hours < 0) {
          errors.push(`Invalid hours for ${day}: must be a non-negative number.`)
        }
        if (hours > MAX_DAILY_HOURS) {
          errors.push(`Hours exceed daily maximum of ${MAX_DAILY_HOURS} for ${day}.`)
        }
      }
      const entryTotal = Object.values(entry.hours).reduce((sum, h) => sum + h, 0)
      if (entryTotal > 0 && !entry.description.trim()) {
        errors.push('Work items with hours require a description.')
      }
    })
    // Mirror totals' day rules (regular = Mon–Fri, overtime = Sat–Sun) so the
    // "at least one day" check sees the same hours the summary card shows.
    let validatedTotal = 0
    for (const entry of rows) {
      if (entry.entryType === 'regular') {
        validatedTotal += entry.hours.mon + entry.hours.tue + entry.hours.wed + entry.hours.thu + entry.hours.fri
      } else {
        validatedTotal += entry.hours.sat + entry.hours.sun
      }
    }
    if (validatedTotal <= 0) {
      errors.push('Enter hours for at least one day.')
    }
    return errors
  }

  // H3 (QA.md): the week ‹ › controls must never mutate the open timesheet's
  // weekStart — that silently relocated the whole timesheet to another week
  // (hours shifted weeks; E11000 on the (userId, projectId, weekStart) unique
  // index). They now truly navigate: open the adjacent week's existing
  // timesheet for this project, or create a fresh draft for that week.
  const handleNavigateWeek = async (direction: -1 | 1) => {
    if (!existingTimesheet || !user || !project || isNavigatingWeek) return
    const targetWeekStart = toLocalDateString(addWeeks(parseLocalDate(existingTimesheet.weekStart), direction))
    const existing = timesheets.find((t) => t.userId === user.id && t.projectId === project.id && t.weekStart === targetWeekStart)
    if (existing) {
      navigate(`/user/timesheets/${existing.id}`)
      return
    }
    setIsNavigatingWeek(true)
    try {
      const created = await createTimesheet({
        userId: user.id,
        projectId: project.id,
        weekStart: targetWeekStart,
        entries: [{ id: createEntryId(), description: '', entryType: 'regular', hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } }],
        notes: '',
      })
      await refreshTimesheets()
      addToast('info', `Created a timesheet for the week of ${targetWeekStart}.`)
      navigate(`/user/timesheets/${created.id}`)
    } catch (err) {
      const message = failureMessage(err, { what: 'open that week', reassurance: 'No changes were made', next: 'pick another week or go back' })
      addToast('error', message)
    } finally {
      setIsNavigatingWeek(false)
    }
  }

  const handleEntryChange = (entryId: string, day: DayKey, value: number) => {
    setEntries((prev) => prev.map((entry) => {
      if (entry.id !== entryId) return entry
      const hours = { ...entry.hours, [day]: Math.max(0, Math.min(24, Number.isFinite(value) ? value : 0)) }
      return { ...entry, hours }
    }))
  }

  const handleDescriptionChange = (entryId: string, description: string) => {
    setEntries((prev) => prev.map((entry) => entry.id === entryId ? { ...entry, description } : entry))
  }

  const handleEntryTypeChange = (entryId: string, entryType: TimesheetEntry['entryType']) => {
    // H2 (QA.md): when the type changes, hours on days the new type does not
    // allow would otherwise be silently retained and only rejected by the
    // backend. Zero them out and tell the user what was removed.
    const forbiddenDays = entryType === 'regular' ? OVERTIME_DAYS : REGULAR_DAYS
    setEntries((prev) => prev.map((entry) => {
      if (entry.id !== entryId || entry.entryType === entryType) return entry
      const removed: string[] = []
      const hours = { ...entry.hours }
      for (const day of forbiddenDays) {
        if (hours[day] > 0) {
          removed.push(`${day} ${hours[day]}\u00a0h`)
          hours[day] = 0
        }
      }
      if (removed.length > 0) {
        addToast('info', `Removed ${removed.join(', ')} — ${entryType} entries only allow ${entryType === 'regular' ? 'Mon–Fri' : 'Sat–Sun'}.`)
      }
      return { ...entry, entryType, hours }
    }))
  }

  const handleAddEntry = () => {
    // QA M17: use crypto.randomUUID() instead of Date.now() — two entries
    // added in the same millisecond would share a React key and break row
    // updates.
    setEntries((prev) => [...prev, { id: createEntryId(), description: '', entryType: 'regular', hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } }])
  }

  const handleRemoveEntry = (entryId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId))
  }

  const calcEntryTotal = (entry: TimesheetEntry) => {
    return Object.values(entry.hours).reduce((sum, h) => sum + h, 0)
  }

  const totals = useMemo(() => {
    let regularHours = 0
    let overtimeHours = 0
    for (const entry of entries) {
      if (entry.entryType === 'regular') {
        regularHours += entry.hours.mon + entry.hours.tue + entry.hours.wed + entry.hours.thu + entry.hours.fri
      } else {
        overtimeHours += entry.hours.sat + entry.hours.sun
      }
    }
    return { regularHours, overtimeHours, totalHours: regularHours + overtimeHours }
  }, [entries])

  const progressPercent = Math.min(100, Math.max(0, (totals.totalHours / weeklyTarget) * 100))
  const isAboveTarget = totals.totalHours > weeklyTarget

  // --- ts.md Phase 7.1 — daily rows grouped under each day column ---------
  const dailyRows = dailyEntries ?? EMPTY_DAILY_ROWS
  const dailyByDay = useMemo(() => {
    const byDay = new Map<DayKey, DailyTimesheet[]>()
    for (const day of DAYS) byDay.set(day, [])
    for (const row of dailyRows) {
      byDay.get(row.dayOfWeek)?.push(row)
    }
    return byDay
  }, [dailyRows])
  const dayLabels = useMemo(() => {
    const labels = new Map<DayKey, string>()
    for (const { dayKey, label } of getWeekDates(weekStart)) {
      labels.set(dayKey as DayKey, label)
    }
    return labels
  }, [weekStart])
  const dailyTotalHours = useMemo(
    () => dailyRows.reduce((sum, row) => sum + row.hours, 0),
    [dailyRows],
  )
  // Auto-sync banner: daily logs are the source of truth (Phase 3 compiles on
  // every save), so a drift from the parent grid means this editor's working
  // copy is stale and should be re-compiled before submission.
  const isOutOfSync = dailyRows.length > 0 && Math.abs(dailyTotalHours - totals.totalHours) > 0.01
  const hasLockedDailyRows = dailyRows.some((row) => row.status === 'locked')
  // compileWeeklyTimesheet only accepts draft/declined/withdrawn parents (the
  // backend rejects pending/approved with a status error), so gate the CTA to
  // exactly the statuses where the user can also submit.
  const canCompile = status === 'draft' || status === 'withdrawn' || status === 'declined'

  const toggleTray = (day: DayKey) => {
    const hasEntries = (dailyByDay.get(day)?.length ?? 0) > 0
    // Default: expanded when the day has rows; the override flips that.
    const currentlyOpen = trayOverrides[day] ?? hasEntries
    setTrayOverrides((prev) => ({ ...prev, [day]: !currentlyOpen }))
  }

  // ts.md 7.2 — explicit end-of-week CTA: re-aggregate daily logs into the
  // parent (POST /timesheets/daily/compile), then refresh local copies.
  const handleCompile = async () => {
    if (!existingTimesheet || !project || isCompiling) return
    setIsCompiling(true)
    try {
      const compiled = await compileWeeklyTimesheet(project.id, existingTimesheet.weekStart)
      if (!compiled) {
        addToast('error', failureText({ what: 'compile your daily logs', reassurance: 'The weekly grid is unchanged', next: 'try again in a moment' }))
        return
      }
      // The compiled rows are now the saved server state for the rows half —
      // re-base only that half so unsaved notes remain guarded (ts.md 7.3).
      const compiledEntries = compiled.entries.map((e) => ({ ...e, hours: { ...e.hours } }))
      setEntries(compiledEntries)
      rebaseSavedRows(compiledEntries)
      await refreshTimesheets()
      setDailyTick((tick) => tick + 1)
      setIsCompileConfirmOpen(false)
      addToast('success', `Compiled daily logs — weekly total ${formatHours(compiled.totalHours)}.`)
    } catch (err) {
      const message = failureMessage(err, { what: 'compile your daily logs', reassurance: 'The weekly grid is unchanged', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setIsCompiling(false)
    }
  }

  // ts.md 7.2 — pre-submission warnings (non-blocking): weekdays with no
  // hours, missing descriptions, and uncompiled/stale daily logs.
  const getSubmissionWarnings = (): string[] => {
    const warnings: string[] = []
    for (const day of REGULAR_DAYS) {
      const dayTotal = entries.reduce((sum, entry) => sum + entry.hours[day], 0)
      if (dayTotal <= 0) {
        const label = day.charAt(0).toUpperCase() + day.slice(1)
        warnings.push(`${label} has no hours recorded this week.`)
      }
    }
    const missingDesc = entries.filter((entry) => calcEntryTotal(entry) > 0 && !entry.description.trim()).length
    if (missingDesc > 0) {
      warnings.push(`${missingDesc} work ${missingDesc === 1 ? 'item is' : 'items are'} missing a description.`)
    }
    const missingDailyDesc = dailyRows.filter((row) => !row.description.trim()).length
    if (missingDailyDesc > 0) {
      warnings.push(`${missingDailyDesc} daily ${missingDailyDesc === 1 ? 'entry is' : 'entries are'} missing a description.`)
    }
    if (isOutOfSync) {
      warnings.push(`Daily logs (${formatHours(dailyTotalHours)}) and this grid (${formatHours(totals.totalHours)}) are out of sync — they will be compiled before submitting.`)
    }
    return warnings
  }

  const handleSaveDraft = async () => {
    if (!existingTimesheet || !user || !project) return
    const errors = getValidationErrors()
    setValidationErrors(errors)
    if (errors.length > 0) {
      addToast('error', 'Please fix validation errors before saving.')
      return
    }
    setIsSaving(true)
    try {
      const data = {
        userId: user.id,
        projectId: project.id,
        weekStart,
        entries,
        notes,
      }
      // H1 (QA.md): check the result — a falsy return means the backend
      // rejected the save (day rules, E11000 week collision), so do not
      // show a success toast.
      const updated = await saveDraft(existingTimesheet.id, data)
      if (!updated) {
        addToast('error', failureText({ what: 'save that draft', reassurance: 'Your edits are still on screen', next: 'try again in a moment' }))
        return
      }
      addToast('success', 'Draft saved')
      // Checklist item 1.2: the working copy is now the saved state — leaving
      // must not prompt.
      rebaseSavedSnapshot()
      await refreshTimesheets()
    } catch (err) {
      const message = failureMessage(err, { what: 'save that draft', reassurance: 'Your edits are still on screen', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!existingTimesheet || !user || !project) return
    setIsProcessing(true)
    try {
      // ts.md 7.2 — compile this week's daily logs into the parent first so
      // the submitted totals always reflect the daily source of truth. Skipped
      // when the week has no daily rows (legacy manual timesheets). Validation
      // runs *after* the compile so it judges the rows actually submitted.
      let workingEntries = entries
      if (dailyRows.length > 0) {
        const compiled = await compileWeeklyTimesheet(project.id, existingTimesheet.weekStart)
        if (!compiled) {
          addToast('error', failureText({ what: 'compile your daily logs first', reassurance: 'Nothing was submitted', next: 'try again in a moment' }))
          return
        }
        workingEntries = compiled.entries.map((e) => ({ ...e, hours: { ...e.hours } }))
        setEntries(workingEntries)
        await refreshTimesheets()
        setDailyTick((tick) => tick + 1)
      }

      const errors = getValidationErrors(workingEntries)
      setValidationErrors(errors)
      if (errors.length > 0) {
        addToast('error', 'Please fix validation errors before submitting.')
        return
      }

      const data = {
        userId: user.id,
        projectId: project.id,
        weekStart,
        entries: workingEntries,
        notes,
      }

      const draft = await saveDraft(existingTimesheet.id, data)
      if (!draft) {
        addToast('error', failureText({ what: 'save that draft', reassurance: 'Your edits are still on screen', next: 'try again in a moment' }))
        return
      }

      const submitted = await submitTimesheet(existingTimesheet.id)
      if (!submitted) {
        // H1 (QA.md): no false success — the backend rejected the submission.
        addToast('error', failureText({ what: 'submit that timesheet', reassurance: 'It is still a draft — nothing was submitted', next: 'try again in a moment' }))
        return
      }

      // The submission notification + activity are created server-side by
      // timesheet.service.ts — the client previously fabricated duplicates via
      // POST /notifications and POST /activities (S2/S3 authorization holes,
      // D1 wrong-actor double-logging). Removed.

      addToast('success', 'Timesheet submitted successfully')
      setIsSubmitOpen(false)
      // Checklist item 1.2: re-base before the programmatic navigate so the
      // blocker lets the intended post-submit navigation through.
      rebaseSavedSnapshot(workingEntries, notes)
      await refreshTimesheets()
      navigate('/user/timesheets')
    } catch (err) {
      const message = failureMessage(err, { what: 'submit that timesheet', reassurance: 'It is still a draft — nothing was submitted', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleWithdraw = async () => {
    if (!existingTimesheet) return
    setIsProcessing(true)
    try {
      const updated = await withdrawTimesheet(existingTimesheet.id, withdrawReason)
      if (!updated) {
        // H1 (QA.md): no false success — the backend rejected the withdrawal.
        addToast('error', failureText({ what: 'withdraw that timesheet', reassurance: 'It is still pending', next: 'try again in a moment' }))
        return
      }
      addToast('success', 'Timesheet withdrawn')
      setIsWithdrawOpen(false)
      setWithdrawReason('')
      // Checklist item 1.2: same re-base as submit — the intended navigation
      // must not trip the guard.
      rebaseSavedSnapshot()
      await refreshTimesheets()
      navigate('/user/timesheets')
    } catch (err) {
      const message = failureMessage(err, { what: 'withdraw that timesheet', reassurance: 'It is still pending', next: 'try again in a moment' })
      addToast('error', message)
    } finally {
      setIsProcessing(false)
    }
  }

  const isReadOnly = status === 'approved'

  if (!existingTimesheet && !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" to={'/user/timesheets'} leftIcon={<ArrowLeft className="h-4 w-4" />} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Weekly Timesheet</h1>
            {project && <p className="text-sm text-muted-foreground">{project.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-border">
            <button type="button" onClick={() => handleNavigateWeek(-1)} disabled={isNavigatingWeek} aria-label="Open previous week" title="Open previous week" className="rounded-l-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-4 py-2 text-sm font-medium text-foreground">{weekStart ? formatWeekRange(weekStart) : '-'}</span>
            <button type="button" onClick={() => handleNavigateWeek(1)} disabled={isNavigatingWeek} aria-label="Open next week" title="Open next week" className="rounded-r-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* ts.md 7.1 — daily entry cards grouped under each day column, with a
          collapsible detail tray holding each day's individual descriptors.
          Read-only: daily rows are edited via the Daily Work Logger. */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">Daily Logs</h2>
            <span className="text-sm text-muted-foreground">
              {dailyEntries === null
                ? 'Loading…'
                : dailyRows.length === 0
                  ? 'No daily entries this week'
                  : `${dailyRows.length} ${dailyRows.length === 1 ? 'entry' : 'entries'} · ${formatHours(dailyTotalHours)}`}
            </span>
            {hasLockedDailyRows && (
              <Badge variant="warning" size="sm" leftIcon={<Lock className="h-3 w-3" />}>Locked</Badge>
            )}
          </div>
          {!isReadOnly && canCompile && dailyRows.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCompileConfirmOpen(true)}
              loading={isCompiling}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Compile from Daily Logs
            </Button>
          )}
        </div>
        {canCompile && isOutOfSync && (
          <div className="flex items-start gap-2 border-b border-border bg-warning-soft px-5 py-3" role="status">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm text-warning">
              Daily logs ({formatHours(dailyTotalHours)}) and this week's grid ({formatHours(totals.totalHours)}) are out
              of sync. The grid will be rebuilt from your daily logs before submission.
            </p>
          </div>
        )}
        <div className="p-5">
          {dailyEntries === null ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {DAYS.map((day) => {
                const dayRows = dailyByDay.get(day) ?? []
                const dayTotal = dayRows.reduce((sum, row) => sum + row.hours, 0)
                const isOpen = trayOverrides[day] ?? dayRows.length > 0
                return (
                  <div key={day} className="overflow-hidden rounded-lg border border-border bg-muted/40">
                    <button
                      type="button"
                      onClick={() => toggleTray(day)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {dayLabels.get(day) ?? day}
                        </span>
                        <span className="block text-sm font-semibold text-foreground">{formatHours(dayTotal)}</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="space-y-2 border-t border-border px-3 py-2">
                        {dayRows.length === 0 ? (
                          <p className="py-1 text-xs text-muted-foreground">No hours logged.</p>
                        ) : (
                          dayRows.map((row) => (
                            <div key={row.id} className="rounded-lg border border-border bg-card p-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">{formatHours(row.hours)}</span>
                                <span className="flex items-center gap-1">
                                  <Badge variant={row.entryType === 'overtime' ? 'warning' : 'default'} size="sm">
                                    {row.entryType === 'overtime' ? 'OT' : 'Regular'}
                                  </Badge>
                                  {row.status === 'locked' && (
                                    <Badge variant="danger" size="sm" leftIcon={<Lock className="h-3 w-3" />}>Locked</Badge>
                                  )}
                                </span>
                              </div>
                              <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                                {row.description || <span className="italic">No description</span>}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Timesheet Entries</h2>
        </div>
        {validationErrors.length > 0 && (
          <div className="border-b border-destructive/20 bg-error-soft px-5 py-3">
            <p className="text-sm font-medium text-destructive">Please fix the following:</p>
            <ul className="mt-1 list-disc list-inside text-sm text-destructive">
              {validationErrors.map((err) => <li key={err}>{err}</li>)}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="sm:sticky sm:left-0 sm:z-10 bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-4 sm:py-3">Work Item</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:py-3">Mon</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:py-3">Tue</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:py-3">Wed</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:py-3">Thu</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:py-3">Fri</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:py-3">Sat</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:py-3">Sun</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-4 sm:py-3">Total</th>
                {!isReadOnly && <th className="sm:sticky sm:right-0 sm:z-10 bg-muted px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-4 sm:py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="sm:sticky sm:left-0 sm:z-10 bg-card px-3 py-2 sm:px-4 sm:py-2">
                    <div className="flex flex-col gap-2">
                      <Input value={entry.description} onChange={(e) => handleDescriptionChange(entry.id, e.target.value)} placeholder="Work item description" disabled={isReadOnly} />
                      {!isReadOnly && (
                        <Select value={entry.entryType} onChange={(e) => handleEntryTypeChange(entry.id, e.target.value as TimesheetEntry['entryType'])} options={[{ value: 'regular', label: 'Regular' }, { value: 'overtime', label: 'Overtime' }]} className="w-32" />
                      )}
                    </div>
                  </td>
                  {DAYS.map((day) => {
                    const isWeekday = REGULAR_DAYS.includes(day)
                    const isEnabled = isReadOnly ? false : entry.entryType === 'regular' ? isWeekday : !isWeekday
                    return (
                      <td key={day} className="px-2 py-2 text-center sm:px-2 sm:py-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="24"
                          step="0.5"
                          value={entry.hours[day as keyof typeof entry.hours] || ''}
                          onChange={(e) => handleEntryChange(entry.id, day, parseFloat(e.target.value) || 0)}
                          disabled={!isEnabled}
                          className={`w-20 rounded-lg border px-2 py-1 text-base sm:text-sm text-center focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 ${isEnabled ? 'border-border' : 'border-border bg-muted text-muted-foreground'}`}
                        />
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right text-sm font-medium text-foreground sm:px-4 sm:py-2">{calcEntryTotal(entry).toFixed(1)}</td>
                  {!isReadOnly && (
                    <td className="sm:sticky sm:right-0 sm:z-10 bg-card px-3 py-2 text-right sm:px-4 sm:py-2">
                      <button type="button" onClick={() => handleRemoveEntry(entry.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-error-soft hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted">
              <tr>
                <td colSpan={9} className="px-3 py-2 text-right text-sm font-semibold text-foreground sm:px-4 sm:py-2">Total Hours</td>
                <td className="px-3 py-2 text-right text-sm font-semibold text-foreground sm:px-4 sm:py-2">{formatHours(totals.totalHours)}</td>
                {!isReadOnly && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        {!isReadOnly && (
          <div className="border-t border-border px-5 py-3">
            <Button variant="secondary" size="sm" onClick={handleAddEntry} leftIcon={<Plus className="h-4 w-4" />}>Add Work Item</Button>
          </div>
        )}
        {/* QA hygiene: document the Regular/Overtime day rules in the UI copy
        so users don't have to guess why a day is greyed out. */}
        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Day rules:</span> Regular entries only accept hours Mon–Fri; overtime entries only accept hours Sat–Sun. Each day is capped at 24h.
        </div>
      </Card>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Timesheet Summary</h2>
        </div>
        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Regular Hours</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{formatHours(totals.regularHours)}</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Overtime</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{formatHours(totals.overtimeHours)}</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Total Hours</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{formatHours(totals.totalHours)}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">Weekly Target</span>
              <span className={`font-medium ${isAboveTarget ? 'text-warning' : 'text-foreground'}`}>{formatHours(totals.totalHours)} / {`${weeklyTarget}\u00a0h`}</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-border">
              <div className={`h-full rounded-full transition-[width] duration-200 ${isAboveTarget ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${progressPercent}%` }} />
            </div>
            {isAboveTarget && <p className="mt-1 text-xs text-warning">You are above the weekly target</p>}
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Weekly Notes</h2>
        </div>
        <div className="p-5">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes for this week…" rows={3} disabled={isReadOnly} />
        </div>
      </Card>

      {!isReadOnly && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="secondary" onClick={handleSaveDraft} loading={isSaving} leftIcon={<Save className="h-4 w-4" />}>Save Draft</Button>
          {status === 'draft' || status === 'withdrawn' || status === 'declined' ? (
            <Button onClick={() => setIsSubmitOpen(true)} leftIcon={<Send className="h-4 w-4" />}>Submit Final</Button>
          ) : status === 'pending' ? (
            <Button variant="secondary" onClick={() => setIsWithdrawOpen(true)} leftIcon={<Edit3 className="h-4 w-4" />}>Withdraw Submission</Button>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={isSubmitOpen}
        onCancel={() => setIsSubmitOpen(false)}
        onConfirm={handleSubmit}
        title="Submit Timesheet?"
        message={`Are you sure you want to submit this timesheet for ${project?.name || 'this project'}? Week: ${weekStart ? formatWeekRange(weekStart) : ''}. Total hours: ${formatHours(totals.totalHours)}.${dailyRows.length > 0 ? ' Your daily logs will be compiled into this timesheet first.' : ''}`}
        confirmLabel="Submit"
        isLoading={isProcessing}
      >
        <WarningList warnings={getSubmissionWarnings()} />
      </ConfirmDialog>

      {/* ts.md 7.2 — explicit "Compile from Daily Logs" CTA confirmation. */}
      <ConfirmDialog
        open={isCompileConfirmOpen}
        onCancel={() => setIsCompileConfirmOpen(false)}
        onConfirm={handleCompile}
        title="Compile from Daily Logs?"
        message={`Rebuild this week's entries from your ${dailyRows.length} daily ${dailyRows.length === 1 ? 'log' : 'logs'} (${formatHours(dailyTotalHours)})? Unsaved edits to the grid below will be replaced. Notes are kept.`}
        confirmLabel="Compile"
        isLoading={isCompiling}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => { setIsWithdrawOpen(false); setWithdrawReason('') }}
        onConfirm={handleWithdraw}
        reason={withdrawReason}
        onReasonChange={setWithdrawReason}
        isLoading={isProcessing}
      />

      {/* Guideline 5.15 → interface_guide.txt:93 ("Unsaved changes") + ts.md 7.3: in-app navigation
          with unsaved rows/notes is intercepted by useBlocker — the snapshot is
          re-based after saves and compiles so only genuine local edits block. */}
      <ConfirmDialog
        open={unsavedBlocker.state === 'blocked'}
        onCancel={() => unsavedBlocker.state === 'blocked' && unsavedBlocker.reset()}
        onConfirm={() => unsavedBlocker.state === 'blocked' && unsavedBlocker.proceed()}
        title="Discard unsaved changes?"
        message="You have unsaved edits to this timesheet's entries or notes. Leaving now will lose them."
        confirmLabel="Discard changes"
        variant="danger"
      />
    </div>
  )
}

function WithdrawModal({ isOpen, onClose, onConfirm, reason, onReasonChange, isLoading }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; reason: string; onReasonChange: (reason: string) => void; isLoading?: boolean }) {
  const handleSubmit = () => {
    onConfirm()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Withdraw Timesheet" description="Optionally provide a reason for withdrawing this timesheet." size="md">
      <div className="space-y-4">
        <Textarea value={reason} onChange={(e) => onReasonChange(e.target.value)} placeholder="Reason for withdrawal (optional)" rows={3} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button variant="danger" onClick={handleSubmit} loading={isLoading} disabled={isLoading}>Withdraw</Button>
        </div>
      </div>
    </Modal>
  )
}
