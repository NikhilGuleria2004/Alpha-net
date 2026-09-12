import { useState, useEffect } from 'react'
import { Building2, Clock3, Bell } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Switch } from '../../components/ui/Switch'
import { Checkbox } from '../../components/ui/Checkbox'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import type { DayKey } from '../../types/project'

const timezones = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
]

const weekDays = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
]

export function Settings() {
  const { addToast } = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const [companyName, setCompanyName] = useState('Eniac')
  const [timezone, setTimezone] = useState('America/New_York')
  const [weeklyStartDay, setWeeklyStartDay] = useState<DayKey>('mon')
  const [workdays, setWorkdays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri'])
  const [standardWeeklyHours, setStandardWeeklyHours] = useState('40')
  const [weekendOvertimeEnabled, setWeekendOvertimeEnabled] = useState(true)
  const [submissionNotifications, setSubmissionNotifications] = useState(true)
  const [deadlineReminders, setDeadlineReminders] = useState(true)
  const [approvalNotifications, setApprovalNotifications] = useState(true)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const stored = localStorage.getItem('eniac_settings')
      if (!stored || cancelled) return
      try {
        const data = JSON.parse(stored)
        if (data.companyName) setCompanyName(data.companyName)
        if (data.timezone) setTimezone(data.timezone)
        if (data.weeklyStartDay) setWeeklyStartDay(data.weeklyStartDay)
        if (data.workdays) setWorkdays(data.workdays)
        if (data.standardWeeklyHours) setStandardWeeklyHours(data.standardWeeklyHours)
        if (typeof data.weekendOvertimeEnabled === 'boolean') setWeekendOvertimeEnabled(data.weekendOvertimeEnabled)
        if (typeof data.submissionNotifications === 'boolean') setSubmissionNotifications(data.submissionNotifications)
        if (typeof data.deadlineReminders === 'boolean') setDeadlineReminders(data.deadlineReminders)
        if (typeof data.approvalNotifications === 'boolean') setApprovalNotifications(data.approvalNotifications)
        if (data.logoPreview) setLogoPreview(data.logoPreview)
      } catch {
        // ignore
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    const data = {
      companyName,
      timezone,
      weeklyStartDay,
      workdays,
      standardWeeklyHours,
      weekendOvertimeEnabled,
      submissionNotifications,
      deadlineReminders,
      approvalNotifications,
      logoPreview,
    }
    localStorage.setItem('eniac_settings', JSON.stringify(data))
    addToast('success', 'Settings saved successfully')
    setIsSaving(false)
  }

  const handleWorkdayChange = (day: string, checked: boolean) => {
    setWorkdays((prev) => (checked ? [...prev, day] : prev.filter((d) => d !== day)))
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Note:</strong> These settings are stored locally in your browser and do not affect backend validation.
        Timesheet rules (Mon–Fri, 40h week) are enforced server-side and cannot be changed here.
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage organization and timesheet preferences.</p>
        </div>
        <Button onClick={handleSave} loading={isSaving}>
          Save Changes
        </Button>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Organization</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <Input label="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Enter company name" />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Logo</label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400">Logo</span>
                )}
              </div>
              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  id="logo-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (event) => {
                      const result = event.target?.result
                      if (typeof result === 'string') {
                        setLogoPreview(result)
                      }
                    }
                    reader.readAsDataURL(file)
                  }}
                />
                <Button variant="secondary" type="button" onClick={() => document.getElementById('logo-upload')?.click()}>
                  Upload Logo
                </Button>
                {logoPreview && (
                  <button type="button" onClick={() => setLogoPreview(null)} className="ml-2 text-xs text-red-600 hover:text-red-700">
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">PNG, JPG up to 2MB. UI only.</p>
          </div>
          <Select label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} options={timezones} />
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Timesheet Settings</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <Select label="Weekly Start Day" value={weeklyStartDay} onChange={(e) => setWeeklyStartDay(e.target.value as DayKey)} options={[{ value: 'mon', label: 'Monday' }, { value: 'tue', label: 'Tuesday' }, { value: 'wed', label: 'Wednesday' }, { value: 'thu', label: 'Thursday' }, { value: 'fri', label: 'Friday' }, { value: 'sat', label: 'Saturday' }, { value: 'sun', label: 'Sunday' }]} />
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Default Workdays</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {weekDays.map((day) => (
                <Checkbox key={day.value} label={day.label} checked={workdays.includes(day.value)} onChange={(checked) => handleWorkdayChange(day.value, checked)} />
              ))}
            </div>
          </div>
          <Input label="Standard Weekly Hours" type="number" min="1" max="168" value={standardWeeklyHours} onChange={(e) => setStandardWeeklyHours(e.target.value)} />
          <Switch label="Weekend Overtime Enabled" description="Allow overtime entries on Saturday and Sunday" checked={weekendOvertimeEnabled} onChange={setWeekendOvertimeEnabled} />
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <Switch label="Submission Notifications" description="Notify supervisors when timesheets are submitted" checked={submissionNotifications} onChange={setSubmissionNotifications} />
          <Switch label="Deadline Reminders" description="Send reminders before project deadlines" checked={deadlineReminders} onChange={setDeadlineReminders} />
          <Switch label="Approval Notifications" description="Notify employees when timesheets are approved or declined" checked={approvalNotifications} onChange={setApprovalNotifications} />
        </div>
      </Card>
    </div>
  )
}
