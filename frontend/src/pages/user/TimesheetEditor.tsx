import { useState, useMemo } from 'react'
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
import { formatDateRange } from '../../utils/date'
import type { Timesheet, TimesheetEntry } from '../../types/timesheet'
import type { DayKey } from '../../types/project'
import { toLocalDateString } from '../../utils/date'

const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel, isLoading }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string; isLoading?: boolean }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
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
  const { timesheets, projects: appProjects, saveDraft, submitTimesheet, withdrawTimesheet, refreshTimesheets } = useAppData()
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
  const [weekStart, setWeekStart] = useState(() => existingTimesheet?.weekStart || (() => {
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
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const getValidationErrors = () => {
    const errors: string[] = []
    if (entries.length === 0) {
      errors.push('Add at least one work item.')
    }
    entries.forEach((entry) => {
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

  const canNavigatePrev = useMemo(() => {
    if (!weekStart) return false
    const today = new Date()
    const currentWeekStart = new Date(today)
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    currentWeekStart.setDate(diff)
    currentWeekStart.setHours(0, 0, 0, 0)
    return new Date(weekStart) < currentWeekStart
  }, [weekStart])

  const canNavigateNext = useMemo(() => {
    if (!weekStart) return false
    const today = new Date()
    const currentWeekStart = new Date(today)
    const day = today.getDay()
    const diff = today.getDate() - day + (day === 0 ? -6 : 1)
    currentWeekStart.setDate(diff)
    currentWeekStart.setHours(0, 0, 0, 0)
    return new Date(weekStart) < currentWeekStart
  }, [weekStart])

  const handlePrevWeek = () => {
    if (!canNavigatePrev || !weekStart) return
    const start = new Date(weekStart)
    start.setDate(start.getDate() - 7)
    setWeekStart(toLocalDateString(start))
  }

  const handleNextWeek = () => {
    if (!canNavigateNext || !weekStart) return
    const start = new Date(weekStart)
    start.setDate(start.getDate() + 7)
    setWeekStart(toLocalDateString(start))
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
    setEntries((prev) => prev.map((entry) => entry.id === entryId ? { ...entry, entryType } : entry))
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
      }
      overtimeHours += entry.hours.sat + entry.hours.sun
    }
    return { regularHours, overtimeHours, totalHours: regularHours + overtimeHours }
  }, [entries])

  const weeklyTarget = 40
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
      await saveDraft(existingTimesheet.id, data)
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
      if (!existingTimesheet || !user || !project) return
      const errors = getValidationErrors()
      setValidationErrors(errors)
      if (errors.length > 0) {
        addToast('error', 'Please fix validation errors before submitting.')
        return
      }

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

      await submitTimesheet(existingTimesheet.id)

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
      await withdrawTimesheet(existingTimesheet.id, withdrawReason)
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
            <h1 className="text-2xl font-semibold text-slate-900">Weekly Timesheet</h1>
            {project && <p className="text-sm text-slate-500">{project.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-200">
            <button type="button" onClick={handlePrevWeek} disabled={!canNavigatePrev} className="rounded-l-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-4 py-2 text-sm font-medium text-slate-700">{weekStart ? formatDateRange(new Date(weekStart), weekEnd!) : '-'}</span>
            <button type="button" onClick={handleNextWeek} disabled={!canNavigateNext} className="rounded-r-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Timesheet Entries</h2>
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
            <thead className="bg-slate-50">
              <tr>
                <th className="sm:sticky sm:left-0 sm:z-10 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-4 sm:py-3">Work Item</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 sm:py-3">Mon</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 sm:py-3">Tue</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 sm:py-3">Wed</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 sm:py-3">Thu</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 sm:py-3">Fri</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 sm:py-3">Sat</th>
                <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 sm:py-3">Sun</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-4 sm:py-3">Total</th>
                {!isReadOnly && <th className="sm:sticky sm:right-0 sm:z-10 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-4 sm:py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="sm:sticky sm:left-0 sm:z-10 bg-white px-3 py-2 sm:px-4 sm:py-2">
                    <div className="flex flex-col gap-2">
                      <Input value={entry.description} onChange={(e) => handleDescriptionChange(entry.id, e.target.value)} placeholder="Work item description" disabled={isReadOnly} />
                      {!isReadOnly && (
                        <Select value={entry.entryType} onChange={(e) => handleEntryTypeChange(entry.id, e.target.value as TimesheetEntry['entryType'])} options={[{ value: 'regular', label: 'Regular' }, { value: 'overtime', label: 'Overtime' }]} className="w-32" />
                      )}
                    </div>
                  </td>
                  {DAYS.map((day) => {
                    const isWeekday = ['mon', 'tue', 'wed', 'thu', 'fri'].includes(day)
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
                          className={`w-16 rounded-lg border px-2 py-1 text-sm text-center focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isEnabled ? 'border-slate-300' : 'border-slate-100 bg-slate-50 text-slate-400'}`}
                        />
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right text-sm font-medium text-slate-900 sm:px-4 sm:py-2">{calcEntryTotal(entry).toFixed(1)}</td>
                  {!isReadOnly && (
                    <td className="sm:sticky sm:right-0 sm:z-10 bg-white px-3 py-2 text-right sm:px-4 sm:py-2">
                      <button type="button" onClick={() => handleRemoveEntry(entry.id)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={9} className="px-3 py-2 text-right text-sm font-semibold text-slate-900 sm:px-4 sm:py-2">Total Hours</td>
                <td className="px-3 py-2 text-right text-sm font-semibold text-slate-900 sm:px-4 sm:py-2">{totals.totalHours.toFixed(1)}h</td>
                {!isReadOnly && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        {!isReadOnly && (
          <div className="border-t border-slate-200 px-5 py-3">
            <Button variant="secondary" size="sm" onClick={handleAddEntry} leftIcon={<Plus className="h-4 w-4" />}>Add Work Item</Button>
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Timesheet Summary</h2>
        </div>
        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Regular Hours</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{totals.regularHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Overtime</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{totals.overtimeHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Total Hours</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{totals.totalHours.toFixed(1)}h</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Weekly Target</span>
              <span className={`font-medium ${isAboveTarget ? 'text-amber-600' : 'text-slate-900'}`}>{totals.totalHours.toFixed(1)}h / {weeklyTarget}h</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
              <div className={`h-full rounded-full transition-all ${isAboveTarget ? 'bg-amber-500' : 'bg-indigo-600'}`} style={{ width: `${progressPercent}%` }} />
            </div>
            {isAboveTarget && <p className="mt-1 text-xs text-amber-600">You are above the weekly target</p>}
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Weekly Notes</h2>
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
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Withdraw Timesheet</h3>
        <p className="mt-2 text-sm text-slate-500">Optionally provide a reason for withdrawing this timesheet.</p>
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
