import { useState, useEffect } from 'react'
import { User, Bell, Palette } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Switch } from '../../components/ui/Switch'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'

export function Settings() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [department, setDepartment] = useState('')
  const [submissionNotifications, setSubmissionNotifications] = useState(true)
  const [deadlineReminders, setDeadlineReminders] = useState(true)
  const [approvalNotifications, setApprovalNotifications] = useState(true)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (user) {
      setName(user.name)
      setEmail(user.email)
      setEmployeeId(user.employeeId)
      setDepartment(user.department)
    }
    const stored = localStorage.getItem('eniac_user_settings')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.submissionNotifications !== undefined) setSubmissionNotifications(data.submissionNotifications)
        if (data.deadlineReminders !== undefined) setDeadlineReminders(data.deadlineReminders)
        if (data.approvalNotifications !== undefined) setApprovalNotifications(data.approvalNotifications)
        if (data.theme) setTheme(data.theme)
      } catch {
        // ignore
      }
    }
    const savedTheme = localStorage.getItem('eniac_theme')
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }
  }, [user])

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    localStorage.setItem('eniac_theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    const data = {
      submissionNotifications,
      deadlineReminders,
      approvalNotifications,
      theme,
    }
    localStorage.setItem('eniac_user_settings', JSON.stringify(data))
    addToast('success', 'Settings saved successfully')
    setIsSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your profile and preferences.</p>
        </div>
        <Button onClick={handleSave} loading={isSaving}>
          Save Changes
        </Button>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Employee ID" value={employeeId} disabled />
          <Input label="Department" value={department} disabled />
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <Switch label="Submission Notifications" description="Notify when timesheets are submitted" checked={submissionNotifications} onChange={setSubmissionNotifications} />
          <Switch label="Deadline Reminders" description="Send reminders before project deadlines" checked={deadlineReminders} onChange={setDeadlineReminders} />
          <Switch label="Approval Notifications" description="Notify when timesheets are approved or declined" checked={approvalNotifications} onChange={setApprovalNotifications} />
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Appearance</h2>
          </div>
        </div>
        <div className="p-5">
          <Switch label="Dark Mode" description="Toggle dark mode for the application" checked={theme === 'dark'} onChange={(checked) => handleThemeChange(checked ? 'dark' : 'light')} />
        </div>
      </Card>
    </div>
  )
}
