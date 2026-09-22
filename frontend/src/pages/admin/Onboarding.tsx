import { useState, useEffect, useCallback, useMemo } from 'react'
import { Check, UserPlus, Mail, Loader2, AlertCircle, Clock } from 'lucide-react'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useToast } from '../../contexts/ToastContext'
import { useAppData } from '../../contexts/AppDataContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { Tooltip } from '../../components/ui/Tooltip'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FullPageSpinner } from '../../components/ui/FullPageSpinner'
import type { Invite, CreateInviteInput } from '../../services/inviteService'
import { validateEmail } from '../../utils/validation'

const DEPARTMENTS = ['Engineering', 'Design', 'Marketing', 'Sales', 'QA', 'Finance', 'HR']

const STEPS = [
  { n: 1, key: 'profile', label: 'Profile' },
  { n: 2, key: 'role', label: 'Role & Access' },
  { n: 3, key: 'password', label: 'Password & Review' },
] as const

type RoleChoice = 'user' | 'supervisor' | 'admin'
type PasswordMode = 'generate' | 'custom'

interface WizardForm {
  firstName: string
  lastName: string
  email: string
  employeeId: string
  department: string
  role: RoleChoice
  supervisorId: string
  projectId: string
  passwordMode: PasswordMode
  customPassword: string
}

const INITIAL_FORM: WizardForm = {
  firstName: '',
  lastName: '',
  email: '',
  employeeId: '',
  department: '',
  role: 'user',
  supervisorId: '',
  projectId: '',
  passwordMode: 'generate',
  customPassword: '',
}

interface PendingInvite {
  id: string
  email: string
  role: RoleChoice
  token: string
  firstName: string
  lastName: string
  employeeId: string
  department: string
  createdAt: Date
  expiresAt: Date
}


function roleBadgeVariant(role: RoleChoice): 'default' | 'info' | 'danger' {
  if (role === 'admin') return 'danger'
  if (role === 'supervisor') return 'info'
  return 'default'
}

function roleLabel(role: RoleChoice): string {
  if (role === 'admin') return 'Admin'
  if (role === 'supervisor') return 'Supervisor'
  return 'Employee'
}

function inviteLinkFor(token: string): string {
  return `${window.location.origin}/invite?token=${token}`
}



export function Onboarding() {
  usePageTitle('User Onboarding')
  const { addToast } = useToast()
  const { projects } = useAppData()

  const [step, setStep] = useState(1)
  const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null)
  const [form, setForm] = useState<WizardForm>(INITIAL_FORM)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resendConfirm, setResendConfirm] = useState<{ id: string; email: string } | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; email: string } | null>(null)

  const [inviteState, setInviteState] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [resendState, setResendState] = useState<'idle' | 'submitting'>('idle')
  const [revokeState, setRevokeState] = useState<'idle' | 'submitting'>('idle')

  const [touched, setTouched] = useState<Partial<Record<keyof WizardForm, boolean>>>({})

  const markTouched = (key: keyof WizardForm) => {
    setTouched((prev) => ({ ...prev, [key]: true }))
  }

  const handleFieldBlur = (key: keyof WizardForm) => {
    markTouched(key)
  }

  const fieldErrors = useMemo(() => {
    const e: Partial<Record<keyof WizardForm, string>> = {}
    const t = touched
    if (t.firstName && form.firstName.trim().length < 2) e.firstName = 'At least 2 characters'
    if (t.lastName && form.lastName.trim().length < 2) e.lastName = 'At least 2 characters'
    if (t.email) {
      if (!form.email.trim()) e.email = 'Email is required'
      else {
        const v = validateEmail(form.email)
        if (!v.valid) e.email = v.message || 'Invalid email address'
      }
    }
    if (t.employeeId && !form.employeeId.trim()) e.employeeId = 'Employee ID is required'
    if (t.department && !form.department) e.department = 'Select a department'
    if (t.supervisorId && form.role !== 'user' && !form.supervisorId) e.supervisorId = 'Select a supervisor'
    if (t.customPassword && form.passwordMode === 'custom' && form.customPassword.length < 8) e.customPassword = 'At least 8 characters'
    return e
  }, [form, touched, validateEmail])

  const stepValid = useMemo(() => {
    switch (step) {
      case 1:
        return !fieldErrors.firstName && !fieldErrors.lastName && !fieldErrors.email && !fieldErrors.employeeId && !fieldErrors.department
      case 2:
        return !fieldErrors.supervisorId
      case 3:
        return true
      default:
        return false
    }
  }, [step, fieldErrors])

  const deptOptions = useMemo(
    () => [{ value: '', label: 'Select department', disabled: true }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))],
    [],
  )

  const [supervisors, setSupervisors] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { getSupervisors } = await import('../../services/userService')
        const list = await getSupervisors()
        if (!cancelled) setSupervisors(list.map((u) => ({ id: u.id, name: u.name })))
      } catch {
        /* non-critical; supervisor select stays empty until next load */
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const supervisorOptions = useMemo(
    () => [{ value: '', label: 'Select supervisor', disabled: true }, ...supervisors.map((s) => ({ value: s.id, label: s.name }))],
    [supervisors],
  )

  const projectOptions = useMemo(
    () => [{ value: '', label: 'Not assigned', disabled: false }, ...projects.map((p) => ({ value: p.id, label: p.name }))],
    [projects],
  )

  const updateField = useCallback(<K extends keyof WizardForm>(key: K, value: WizardForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSubmit = useCallback(
    async (invite: Invite) => {
      const link = inviteLinkFor(invite.token)
      setPendingInvite({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        token: invite.token,
        firstName: invite.firstName ?? '',
        lastName: invite.lastName ?? '',
        employeeId: '',
        department: '',
        createdAt: new Date(invite.createdAt),
        expiresAt: new Date(invite.expiresAt),
      })
      await navigator.clipboard.writeText(link).catch(() => {})
      addToast('success', `Invite sent to ${invite.email}. Link copied to clipboard.`)
      setInviteState('done')
      setStep(3)
    },
    [addToast],
  )

  const handleCreate = useCallback(async () => {
    if (!stepValid) return
    setInviteState('submitting')
    try {
      const payload: CreateInviteInput = {
        email: form.email.trim().toLowerCase(),
        role: form.role,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        employeeId: form.employeeId.trim(),
        department: form.department,
        supervisorId: form.supervisorId || undefined,
        projectId: form.projectId || undefined,
      }
      const { createInvite: apiCreateInvite } = await import('../../services/inviteService')
      const invite = await apiCreateInvite(payload)
      await handleSubmit(invite)
    } catch (err) {
      setInviteState('idle')
      const message = err instanceof Error ? err.message : 'Failed to create invite'
      addToast('error', message)
    }
  }, [form, stepValid, handleSubmit, addToast])

  const handleResend = useCallback(async () => {
    if (!resendConfirm) return
    setResendState('submitting')
    try {
      const { resendInvite: apiResend } = await import('../../services/inviteService')
      const invite = await apiResend(resendConfirm.id)
      const link = inviteLinkFor(invite.token)
      await navigator.clipboard.writeText(link).catch(() => {})
      addToast('success', `Invite resent to ${invite.email}. Link copied to clipboard.`)
    } catch (err) {
      setResendState('idle')
      addToast('error', err instanceof Error ? err.message : 'Failed to resend invite')
    } finally {
      setResendConfirm(null)
    }
  }, [resendConfirm, addToast])

  const handleRevoke = useCallback(async () => {
    if (!revokeConfirm) return
    setRevokeState('submitting')
    try {
      const { revokeInvite: apiRevoke } = await import('../../services/inviteService')
      await apiRevoke(revokeConfirm.id)
      addToast('success', `Invite for ${revokeConfirm.email} has been revoked.`)
    } catch (err) {
      setRevokeState('idle')
      addToast('error', err instanceof Error ? err.message : 'Failed to revoke invite')
    } finally {
      setRevokeConfirm(null)
      setPendingInvite(null)
    }
  }, [revokeConfirm, addToast])

  const handleReset = useCallback(() => {
    setForm(INITIAL_FORM)
    setStep(1)
    setPendingInvite(null)
    setInviteState('idle')
    setConfirmReset(false)
  }, [])

  const inviteStatus = useMemo(() => {
    if (!pendingInvite) return null
    const now = new Date()
    if (pendingInvite.expiresAt <= now) return 'expired' as const
    return 'pending' as const
  }, [pendingInvite])

  const _step = step
  const _inviteState = inviteState
  if (inviteState === 'submitting' || resendState === 'submitting' || revokeState === 'submitting') {
    return <FullPageSpinner />
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">User Onboarding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an invite, assign a role and access, then set the new user's password.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
          Reset form
        </Button>
      </div>

      <div className="flex items-center gap-2" role="tablist" aria-label="Onboarding steps">
        {STEPS.map((s, idx) => {
          const done = step > s.n
          const active = step === s.n
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  done
                    ? 'bg-success text-success-foreground'
                    : active
                    ? 'bg-accent text-accent-foreground ring-2 ring-accent ring-offset-2'
                    : 'bg-muted text-muted-foreground'
                }`}
                role="tab"
                aria-selected={active}
                aria-disabled={!active}
              >
                {done ? <Check className="h-4 w-4" /> : s.n}
              </div>
              <span
                className={`text-sm ${active ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
              >
                {s.label}
              </span>
              {idx < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
            </div>
          )
        })}
      </div>

      {step === 1 && (
        <Card className="overflow-hidden">
          <CardHeader title={<span className="text-base font-semibold">1. Profile</span>}>
            <Badge variant="default">Personal details</Badge>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="First name"
                value={form.firstName}
                onChange={(e) => updateField('firstName', e.target.value)}
                onBlur={() => handleFieldBlur('firstName')}
                error={fieldErrors.firstName}
                autoComplete="given-name"
                placeholder="Ada"
              />
              <Input
                label="Last name"
                value={form.lastName}
                onChange={(e) => updateField('lastName', e.target.value)}
                onBlur={() => handleFieldBlur('lastName')}
                error={fieldErrors.lastName}
                autoComplete="family-name"
                placeholder="Lovelace"
              />
            </div>
            <Input
              label="Work email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
                onBlur={() => handleFieldBlur('email')}
              error={fieldErrors.email}
              autoComplete="email"
              placeholder="ada@example.com"
              leftIcon={<Mail className="h-4 w-4" />}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Employee ID"
                value={form.employeeId}
                onChange={(e) => updateField('employeeId', e.target.value)}
                onBlur={() => handleFieldBlur('employeeId')}
                error={fieldErrors.employeeId}
                autoComplete="organization"
                placeholder="EMP-0042"
              />
              <Select
                label="Department"
                value={form.department}
                onChange={(e) => updateField('department', e.target.value)}
                onBlur={() => handleFieldBlur('department')}
                error={fieldErrors.department}
                options={deptOptions}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              These details are stored on the user record and shown across the app (avatars, user lists, reports).
            </p>
            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setStep(2)} disabled={!stepValid}>
                Next
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 2 && (
        <Card className="overflow-hidden">
          <CardHeader title={<span className="text-base font-semibold">2. Role & Access</span>}>
            <Badge variant="info">Permissions</Badge>
          </CardHeader>
          <CardBody className="space-y-6">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">Role</label>
              <div className="grid gap-3 sm:grid-cols-3">
                {(['user', 'supervisor', 'admin'] as const).map((role) => {
                  const selected = form.role === role
                  const desc =
                    role === 'user'
                      ? 'Standard employee. Logs time, views assigned projects.'
                      : role === 'supervisor'
                      ? 'Approves timesheets and manages their team.'
                      : 'Full admin access to settings, users, and billing.'
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => updateField('role', role)}
                      className={`flex flex-col gap-1 rounded-xl border-2 p-4 text-left transition $ {
                        selected
                          ? 'border-accent bg-accent-soft shadow-sm'
                          : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{roleLabel(role)}</span>
                        {selected && (
                          <div className="flex items-center gap-1 text-accent">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={form.role === 'supervisor' ? 'Reporting supervisor' : 'Supervisor (optional)'}
                value={form.supervisorId}
                onChange={(e) => updateField('supervisorId', e.target.value)}
                onBlur={() => handleFieldBlur('supervisorId')}
                error={fieldErrors.supervisorId}
                options={supervisorOptions}
                disabled={form.role === 'user'}
              />
              {form.role !== 'supervisor' && (
                <p className="sm:mt-1 text-xs text-muted-foreground">Only supervisors report to another supervisor.</p>
              )}
              <Select
                label="Project assignment"
                value={form.projectId}
                onChange={(e) => updateField('projectId', e.target.value)}
                options={projectOptions}
              />
              <p className="mt-1 text-xs text-muted-foreground">Assign the user to a project now, or add them later from the project team page.</p>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <strong className="text-foreground">What this means:</strong>{' '}
              {form.role === 'admin'
                ? 'This user will be able to invite other users, manage projects, and view billing.'
                : form.role === 'supervisor'
                ? 'This user can approve timesheets for their direct reports and view team dashboards.'
                : 'This user can log time against their assigned projects and view their own dashboard.'}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="secondary" onClick={() => setStep(3)} disabled={!stepValid}>
                Next
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 3 && (
        <>
          {pendingInvite ? (
            <Card className="overflow-hidden">
              <CardHeader
                title={<span className="text-base font-semibold">Invite sent to {pendingInvite.email}</span>}
                action={
                  <div className="flex items-center gap-2">
                    <Badge variant={inviteStatus === 'expired' ? 'danger' : 'success'}>
                      {inviteStatus === 'expired' ? 'Expired' : 'Sent'}
                    </Badge>
                    {inviteStatus === 'pending' && (
                      <Tooltip content="Resend the invite email to the user.">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setResendConfirm({ id: pendingInvite.id, email: pendingInvite.email })
                          }
                          leftIcon={<Mail className="h-3.5 w-3.5" />}
                        >
                          Resend
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip content="Revoke this invite. The user will no longer be able to accept it.">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setRevokeConfirm({ id: pendingInvite.id, email: pendingInvite.email })
                        }
                        className="text-destructive hover:bg-error-soft hover:text-destructive"
                        leftIcon={<AlertCircle className="h-3.5 w-3.5" />}
                      >
                        Revoke
                      </Button>
                    </Tooltip>
                  </div>
                }
              >
                <div className="flex items-center gap-3">
                  <Avatar name={`${pendingInvite.firstName} ${pendingInvite.lastName}`} size="md" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {pendingInvite.firstName} {pendingInvite.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{pendingInvite.email}</p>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Role:</span>
                    <Badge variant={roleBadgeVariant(pendingInvite.role)}>
                      {roleLabel(pendingInvite.role)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Department:</span>
                    <span className="text-foreground">{pendingInvite.department || '-'}</span>
                  </div>
                </div>

                {inviteStatus === 'pending' && (
                  <div className="flex items-start gap-3 rounded-lg border border-accent-soft bg-accent-soft/30 px-4 py-3">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Invite link copied to clipboard</p>
                      <p className="text-xs text-muted-foreground break-all font-mono">
                        {inviteLinkFor(pendingInvite.token)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        The user must open this link and set their password to activate the account. Link expires in 7 days.
                      </p>
                    </div>
                  </div>
                )}

                {inviteStatus === 'expired' && (
                  <div className="flex items-start gap-3 rounded-lg border border-error-soft bg-error-soft/30 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">This invite has expired</p>
                      <p className="text-xs text-muted-foreground">
                        Send a new invite to {pendingInvite.email} to continue onboarding.
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  variant="secondary"
                  onClick={() => {
                    setPendingInvite(null)
                    setStep(1)
                  }}
                  leftIcon={<UserPlus className="h-4 w-4" />}
                >
                  Add another user
                </Button>
              </CardBody>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader
                title={<span className="text-base font-semibold">3. Password & Review</span>}
                action={<Badge variant="default">Final step</Badge>}
              />
              <CardBody className="space-y-6">
                <Card className="bg-muted/30">
                  <CardHeader title={<span className="text-sm font-medium">Review before sending</span>} />
                  <CardBody className="space-y-3">
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                      <Avatar name={`${form.firstName} ${form.lastName}`} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">
                          {form.firstName} {form.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{form.email}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <Badge variant={roleBadgeVariant(form.role)}>{roleLabel(form.role)}</Badge>
                        <Badge variant="default" size="sm">
                          {form.department || 'No department'}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Employee ID</span>
                        <span className="text-foreground font-medium">{form.employeeId || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Supervisor</span>
                        <span className="text-foreground font-medium">
                          {form.supervisorId
                            ? supervisors.find((s) => s.id === form.supervisorId)?.name ?? 'Selected'
                            : 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Project</span>
                        <span className="text-foreground font-medium">
                          {form.projectId
                            ? projects.find((p) => p.id === form.projectId)?.name ?? 'Selected'
                            : 'Not assigned'}
                        </span>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-foreground">Set the account password</label>
                  <p className="text-sm text-muted-foreground">
                    The new user will be asked to set this password the first time they open the invite link.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => updateField('passwordMode', 'generate')}
                      className={`flex-1 rounded-xl border-2 py-3 text-left transition $ {
                        form.passwordMode === 'generate'
                          ? 'border-accent bg-accent-soft shadow-sm'
                          : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">Generate a secure password</span>
                        {form.passwordMode === 'generate' && <Check className="h-4 w-4 text-accent" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Auto-generated, meets all password requirements. Share it with the user.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('passwordMode', 'custom')}
                      className={`flex-1 rounded-xl border-2 py-3 text-left transition $ {
                        form.passwordMode === 'custom'
                          ? 'border-accent bg-accent-soft shadow-sm'
                          : 'border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">Set a custom password</span>
                        {form.passwordMode === 'custom' && <Check className="h-4 w-4 text-accent" />}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        You choose the password. Must be at least 8 characters with uppercase, lowercase, and a number.
                      </p>
                    </button>
                  </div>

                  {form.passwordMode === 'custom' && (
                    <div className="space-y-3">
                      <Input
                        label="Custom password"
                        type="password"
                        value={form.customPassword}
                        onChange={(e) => updateField('customPassword', e.target.value)}
                        onBlur={() => handleFieldBlur('customPassword')}
                        error={fieldErrors.customPassword}
                        autoComplete="new-password"
                        placeholder="Enter a strong password"
                      />
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-success" /> 8+ characters
                        </span>
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-success" /> Uppercase letter
                        </span>
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-success" /> Lowercase letter
                        </span>
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3 text-success" /> Number
                        </span>
                      </div>
                    </div>
                  )}

                  {form.passwordMode === 'generate' && (
                    <div className="rounded-lg border border-accent-soft bg-accent-soft/30 px-4 py-3">
                      <p className="text-sm text-muted-foreground">
                        A secure password will be generated automatically when you send the invite.
                      </p>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={() => setStep(step - 1)}
              disabled={_step === 1}
            >
              Back
            </Button>
            {pendingInvite && inviteStatus === 'pending' ? (
              <div />
            ) : (
              <Button
                onClick={handleCreate}
                disabled={!stepValid || _inviteState === 'submitting'}
              >
                {_inviteState === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending invite...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    {pendingInvite ? 'Add another user' : 'Send invite'}
                  </>
                )}
              </Button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reset the form?"
        message="This clears all entered profile, role, and password details. This cannot be undone."
        confirmLabel="Reset"
        onConfirm={handleReset}
        onCancel={() => setConfirmReset(false)}
      />
      <ConfirmDialog
        open={Boolean(resendConfirm)}
        title="Resend invite?"
        message={`Resend the activation link to ${resendConfirm?.email}?`}
        confirmLabel="Resend"
        onConfirm={handleResend}
        onCancel={() => setResendConfirm(null)}
      />
      <ConfirmDialog
        open={Boolean(revokeConfirm)}
        title="Revoke invite?"
        message={`This will revoke the invite for ${revokeConfirm?.email}. The user will no longer be able to accept it.`}
        confirmLabel="Revoke"
        variant="danger"
        onConfirm={handleRevoke}
        onCancel={() => setRevokeConfirm(null)}
      />
    </div>
  )
}
