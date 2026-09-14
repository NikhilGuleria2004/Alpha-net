import { useState, useEffect } from 'react'
import { Bell, User, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { Card } from '../../components/ui/Card'
import { Switch } from '../../components/ui/Switch'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useToast } from '../../contexts/ToastContext'
import { getMyNotificationPrefs, putMyNotificationPrefs, updateMyProfile } from '../../services/settingsService'
import { changePassword } from '../../services/authService'

export function Settings() {
  const { user, logout } = useAuth()
  const { addToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [submissionNotifications, setSubmissionNotifications] = useState(true)
  const [deadlineReminders, setDeadlineReminders] = useState(true)
  const [approvalNotifications, setApprovalNotifications] = useState(true)

  // QA M4: self-service profile. Name/email/employeeId/department are now
  // real fields backed by PATCH /users/me.
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [employeeId, setEmployeeId] = useState(user?.employeeId ?? '')
  const [department, setDepartment] = useState(user?.department ?? '')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [isProfileSaving, setIsProfileSaving] = useState(false)

  // QA M4: self-service password change via POST /auth/change-password. On
  // success the backend revokes all sessions, so the client signs out too.
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isPasswordSaving, setIsPasswordSaving] = useState(false)

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

  // QA M4: self-service profile update. PATCH /users/me — a user can change
  // their own name, email, employee ID and department. Restricted schema on
  // the backend omits role/status/isSupervisor/supervisorId/password, which
  // remain admin-only via PATCH /users/:id.
  const handleProfileSave = async () => {
    setProfileError(null)
    setIsProfileSaving(true)
    try {
      await updateMyProfile({ name, email, employeeId, department })
      addToast('success', 'Profile updated successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile'
      setProfileError(message)
      addToast('error', message)
    } finally {
      setIsProfileSaving(false)
    }
  }

  // QA M4: self-service password change. POST /auth/change-password requires
  // the current password and enforces the same strength rules as registration.
  // On success the backend revokes all sessions, so the client signs out too.
  const handlePasswordSave = async () => {
    setPasswordError(null)
    if (!currentPassword || !newPassword || !confirmPassword) {
      const msg = 'All password fields are required'
      setPasswordError(msg)
      addToast('error', msg)
      return
    }
    if (newPassword !== confirmPassword) {
      const msg = 'New passwords do not match'
      setPasswordError(msg)
      addToast('error', msg)
      return
    }
    if (newPassword.length < 8) {
      const msg = 'Password must be at least 8 characters'
      setPasswordError(msg)
      addToast('error', msg)
      return
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      const msg = 'Password must contain an uppercase letter, a lowercase letter, and a number'
      setPasswordError(msg)
      addToast('error', msg)
      return
    }
    setIsPasswordSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      addToast('success', 'Password changed. Please sign in again.')
      // Backend revoked all sessions — sign out locally so the stale token
      // doesn't linger.
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => void logout(), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password'
      setPasswordError(message)
      addToast('error', message)
    } finally {
      setIsPasswordSaving(false)
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

      {/* QA M4: self-service profile — name/email/employeeId/department now
      backed by PATCH /users/me, with the restricted schema omitting
      role/status/isSupervisor/supervisorId/password. */}
      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {profileError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {profileError}
            </div>
          )}
          <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Work Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
          <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
          <div className="flex justify-end">
            <Button onClick={handleProfileSave} loading={isProfileSaving}>
              Save Profile
            </Button>
          </div>
        </div>
      </Card>

      {/* QA M4: self-service password change via POST /auth/change-password.
      On success the backend revokes all sessions, so the client signs out. */}
      <Card>
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-foreground">Change Password</h2>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {passwordError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {passwordError}
            </div>
          )}
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 chars, upper + lower + digit"
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
          <p className="text-xs text-muted-foreground">
            After changing, you'll be signed out on all other devices.
          </p>
          <div className="flex justify-end">
            <Button onClick={handlePasswordSave} loading={isPasswordSaving}>
              Change Password
            </Button>
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
