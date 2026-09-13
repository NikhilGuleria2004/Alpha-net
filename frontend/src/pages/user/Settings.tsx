import { useState, useEffect } from 'react'
import { Bell, Sun } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { Card } from '../../components/ui/Card'
import { Switch } from '../../components/ui/Switch'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { getMyNotificationPrefs, putMyNotificationPrefs } from '../../services/settingsService'

export function Settings() {
  const { theme, toggleTheme } = useTheme()
  const { addToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [submissionNotifications, setSubmissionNotifications] = useState(true)
  const [deadlineReminders, setDeadlineReminders] = useState(true)
  const [approvalNotifications, setApprovalNotifications] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const prefs = await getMyNotificationPrefs()
        if (cancelled) return
        setSubmissionNotifications(prefs.submissionNotifications)
        setDeadlineReminders(prefs.deadlineReminders)
        setApprovalNotifications(prefs.approvalNotifications)
      } catch {
        if (!cancelled) addToast('error', 'Failed to load notification preferences')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [addToast])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await putMyNotificationPrefs({
        submissionNotifications,
        deadlineReminders,
        approvalNotifications,
      })
      addToast('success', 'Settings saved successfully')
    } catch {
      addToast('error', 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your profile and preferences.</p>
        </div>
        <Button onClick={handleSave} loading={isSaving} disabled={isLoading}>
          Save Changes
        </Button>
      </div>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Sun className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark themes. Your preference is saved on this device.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Toggle dark mode"
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                theme === 'dark' ? 'bg-indigo-600' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-card shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                  theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-foreground">Notification Preferences</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <Switch label="Submission Notifications" description="Notify when timesheets are submitted" checked={submissionNotifications} onChange={setSubmissionNotifications} />
          <Switch label="Deadline Reminders" description="Send reminders before project deadlines" checked={deadlineReminders} onChange={setDeadlineReminders} />
          <Switch label="Approval Notifications" description="Notify when timesheets are approved or declined" checked={approvalNotifications} onChange={setApprovalNotifications} />
          <p className="text-xs text-muted-foreground">Notification preferences are saved to your account and sync across devices.</p>
        </div>
      </Card>
    </div>
  )
}
