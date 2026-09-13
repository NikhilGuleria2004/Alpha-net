import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2, Save, Send, Edit3 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Textarea } from '../../components/ui/Textarea'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { addWeeks, formatDateRange, parseLocalDate, toLocalDateString } from '../../utils/date'
import { getOrgSettings } from '../../services/settingsService'
import type { Timesheet, TimesheetEntry } from '../../types/timesheet'
import type { DayKey } from '../../types/project'

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

// Mirror the backend day-of-week rules (backend/src/services/timesheet.service.ts:84-116):
// regular entries are Mon–Fri only, overtime entries are Sat–Sun only, max 24h/day.
const REGULAR_DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const OVERTIME_DAYS: DayKey[] = ['sat', 'sun']
const MAX_DAILY_HOURS = 24

function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel, isLoading }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string; isLoading?: boolean }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={onConfirm} loading={isLoading}>{confirmLabel || 'Confirm'}</Button>
        </div>
      </div>
    </div>
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
    return [{ id: `entry-${Date.now()}`, description: '', entryType: 'regular', hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } }]
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

  const getValidationErrors = () => {
    const errors: string[] = []
    if (entries.length === 0) {
      errors.push('Add at least one work item.')
    }
    entries.forEach((entry) => {
      // H2 (QA.md): mirror backend validateEntries — regular = Mon–Fri only,
      // overtime = Sat–Sun only — so the editor catches day-rule violations
      // inline instead of relying on the backend to reject the save.
      if (entry.entryType === 'regular') {
        for (const day of OVERTIME_DAYS) {
          const hours = entry.hours[day]
          if (hours > 0) {
            errors.push(`Regular entry "${entry.description}" has hours on ${day} (${hours}h). Regular entries must be Mon-Fri only.`)
          }
        }
      } else if (entry.entryType === 'overtime') {
        for (const day of REGULAR_DAYS) {
          const hours = entry.hours[day]
          if (hours > 0) {
            errors.push(`Overtime entry "${entry.description}" has hours on ${day} (${hours}h). Overtime entries must be Sat-Sun only.`)
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
    if (totals.totalHours <= 0) {
      errors.push('Enter hours for at least one day.')
    }
    return errors
  }

  const weekEnd = useMemo(() => {
    if (!weekStart) return null
    const start = new Date(weekStart)
    const end = new Date(start)
    end.setDate(end.getDate() + 4)
    return end
  }, [weekStart])

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
        entries: [{ id: `entry-${Date.now()}`, description: '', entryType: 'regular', hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } }],
        notes: '',
      })
      await refreshTimesheets()
      addToast('info', `Created a timesheet for the week of ${targetWeekStart}.`)
      navigate(`/user/timesheets/${created.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open that week'
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
          removed.push(`${day} ${hours[day]}h`)
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
    setEntries((prev) => [...prev, { id: `entry-${Date.now()}`, description: '', entryType: 'regular', hours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } }])
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
        addToast('error', 'Failed to save draft. Please try again.')
        return
      }
      addToast('success', 'Draft saved')
      await refreshTimesheets()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save draft'
      addToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!existingTimesheet || !user || !project) return
    const errors = getValidationErrors()
    setValidationErrors(errors)
    if (errors.length > 0) {
      addToast('error', 'Please fix validation errors before submitting.')
      return
    }
    setIsProcessing(true)
    try {
      const data = {
        userId: user.id,
        projectId: project.id,
        weekStart,
        entries,
        notes,
      }

      const draft = await saveDraft(existingTimesheet.id, data)
      if (!draft) {
        addToast('error', 'Failed to save draft. Please try again.')
        return
      }

      const submitted = await submitTimesheet(existingTimesheet.id)
      if (!submitted) {
        // H1 (QA.md): no false success — the backend rejected the submission.
        addToast('error', 'Failed to submit timesheet. Please try again.')
        return
      }

      // The submission notification + activity are created server-side by
      // timesheet.service.ts — the client previously fabricated duplicates via
      // POST /notifications and POST /activities (S2/S3 authorization holes,
      // D1 wrong-actor double-logging). Removed.

      addToast('success', 'Timesheet submitted successfully')
      setIsSubmitOpen(false)
      await refreshTimesheets()
      navigate('/user/timesheets')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit timesheet'
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
        addToast('error', 'Failed to withdraw timesheet. Please try again.')
        return
      }
      addToast('success', 'Timesheet withdrawn')
      setIsWithdrawOpen(false)
      setWithdrawReason('')
      await refreshTimesheets()
      navigate('/user/timesheets')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to withdraw timesheet'
      addToast('error', message)
    } finally {
      setIsProcessing(false)
    }
  }

  const isReadOnly = status === 'approved'

  if (!existingTimesheet && !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/user/timesheets')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Weekly Timesheet</h1>
            {project && <p className="text-sm text-muted-foreground">{project.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-border">
            <button type="button" onClick={() => handleNavigateWeek(-1)} disabled={isNavigatingWeek} aria-label="Open previous week" title="Open previous week" className="rounded-l-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-4 py-2 text-sm font-medium text-foreground">{weekStart ? formatDateRange(new Date(weekStart), weekEnd!) : '-'}</span>
            <button type="button" onClick={() => handleNavigateWeek(1)} disabled={isNavigatingWeek} aria-label="Open next week" title="Open next week" className="rounded-r-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Timesheet Entries</h2>
        </div>
        {validationErrors.length > 0 && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-3">
            <p className="text-sm font-medium text-red-700">Please fix the following:</p>
            <ul className="mt-1 list-disc list-inside text-sm text-red-600">
              {validationErrors.map((err) => <li key={err}>{err}</li>)}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
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
            <tbody className="divide-y divide-slate-200 bg-card">
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
                          min="0"
                          max="24"
                          step="0.5"
                          value={entry.hours[day as keyof typeof entry.hours] || ''}
                          onChange={(e) => handleEntryChange(entry.id, day, parseFloat(e.target.value) || 0)}
                          disabled={!isEnabled}
                          className={`w-16 rounded-lg border px-2 py-1 text-sm text-center focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isEnabled ? 'border-border' : 'border-slate-100 bg-muted text-muted-foreground'}`}
                        />
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right text-sm font-medium text-foreground sm:px-4 sm:py-2">{calcEntryTotal(entry).toFixed(1)}</td>
                  {!isReadOnly && (
                    <td className="sm:sticky sm:right-0 sm:z-10 bg-card px-3 py-2 text-right sm:px-4 sm:py-2">
                      <button type="button" onClick={() => handleRemoveEntry(entry.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted">
              <tr>
                <td colSpan={9} className="px-3 py-2 text-right text-sm font-semibold text-foreground sm:px-4 sm:py-2">Total Hours</td>
                <td className="px-3 py-2 text-right text-sm font-semibold text-foreground sm:px-4 sm:py-2">{totals.totalHours.toFixed(1)}h</td>
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
      </Card>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Timesheet Summary</h2>
        </div>
        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Regular Hours</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{totals.regularHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Overtime</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{totals.overtimeHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium text-muted-foreground">Total Hours</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{totals.totalHours.toFixed(1)}h</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">Weekly Target</span>
              <span className={`font-medium ${isAboveTarget ? 'text-amber-600' : 'text-foreground'}`}>{totals.totalHours.toFixed(1)}h / {weeklyTarget}h</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
              <div className={`h-full rounded-full transition-all ${isAboveTarget ? 'bg-amber-500' : 'bg-indigo-600'}`} style={{ width: `${progressPercent}%` }} />
            </div>
            {isAboveTarget && <p className="mt-1 text-xs text-amber-600">You are above the weekly target</p>}
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Weekly Notes</h2>
        </div>
        <div className="p-5">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes for this week..." rows={3} disabled={isReadOnly} />
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
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        onConfirm={handleSubmit}
        title="Submit Timesheet?"
        description={`Are you sure you want to submit this timesheet for ${project?.name || 'this project'}? Week: ${weekStart ? formatDateRange(new Date(weekStart), weekEnd!) : ''}. Total hours: ${totals.totalHours.toFixed(1)}h.`}
        confirmLabel="Submit"
        isLoading={isProcessing}
      />

      <WithdrawModal
        isOpen={isWithdrawOpen}
        onClose={() => { setIsWithdrawOpen(false); setWithdrawReason('') }}
        onConfirm={handleWithdraw}
        reason={withdrawReason}
        onReasonChange={setWithdrawReason}
        isLoading={isProcessing}
      />
    </div>
  )
}

function WithdrawModal({ isOpen, onClose, onConfirm, reason, onReasonChange, isLoading }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; reason: string; onReasonChange: (reason: string) => void; isLoading?: boolean }) {
  if (!isOpen) return null

  const handleSubmit = () => {
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Withdraw Timesheet</h3>
        <p className="mt-2 text-sm text-muted-foreground">Optionally provide a reason for withdrawing this timesheet.</p>
        <div className="mt-4">
          <Textarea value={reason} onChange={(e) => onReasonChange(e.target.value)} placeholder="Reason for withdrawal (optional)" rows={3} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button variant="danger" onClick={handleSubmit} loading={isLoading}>Withdraw</Button>
        </div>
      </div>
    </div>
  )
}
