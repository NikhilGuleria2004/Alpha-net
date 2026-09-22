import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { validateEmail, validatePassword } from '../../utils/validation'
import { canDemoteAdmin } from '../../utils/permissions'
import type { CreateUserInput } from '../../types/user'

export function EditUser() {
  const { userId } = useParams<{ userId: string }>()
  const { users, updateUser, refreshUsers } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)

  const user = users.find((u) => u.id === userId)

  const [form, setForm] = useState<CreateUserInput>({
    name: '',
    email: '',
    employeeId: '',
    department: '',
    role: 'user',
    isSupervisor: false,
    status: 'active',
    supervisorId: undefined,
    password: '',
  })

  // QA M10: pre-check the same guardrails the backend enforces so the admin
  // discovers the rule before submitting, not via a 400 toast after the fact.
  // These depend on the current form state, so they're computed after `form`
  // is declared and re-derived on every render.
  const demoteGuard = user ? canDemoteAdmin(user, users) : { ok: false, reason: 'Loading…' }

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
        isSupervisor: user.isSupervisor,
        status: user.status,
        supervisorId: user.supervisorId,
        password: '',
      })
    }
  }, [user])

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  const departments = ['Engineering', 'Design', 'Marketing', 'Sales', 'QA', 'Finance', 'HR']
  const supervisorOptions = users.filter((u) => u.isSupervisor && u.status === 'active')

  const updateField = (field: keyof CreateUserInput, value: string | boolean | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    const requiredFields: (keyof CreateUserInput)[] = ['name', 'email', 'employeeId', 'department']
    for (const field of requiredFields) {
      const value = form[field]
      if (!value || (typeof value === 'string' && !value.trim())) {
        newErrors[field] = `${field.charAt(0).toUpperCase() + field.slice(1)} is required`
      }
    }
    const emailValidation = validateEmail(form.email)
    if (!emailValidation.valid) newErrors.email = emailValidation.message || ''
    // Optional on edit: only validate when the admin is rotating the password.
    if (form.password) {
      const pw = validatePassword(form.password)
      if (!pw.valid) newErrors.password = pw.message || 'Password does not meet requirements'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      // The PATCH contract treats an absent password as "keep current" — an
      // empty string would fail backend min-length validation, so strip it.
      const { password, ...rest } = form
      const payload: Partial<CreateUserInput> = password.trim() ? { ...rest, password } : rest
      await updateUser(user.id, payload)
      addToast('success', 'User updated successfully')
      refreshUsers()
      navigate(`/admin/users/${user.id}`)
    } catch {
      addToast('error', 'Failed to update user')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(`/admin/users/${user.id}`)} leftIcon={<ArrowLeft className="h-4 w-4" />} />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Edit User</h1>
          <p className="mt-1 text-sm text-muted-foreground">Update user details and permissions.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">User Information</h2>
          </div>
          <div className="p-5 space-y-5">
            <Input label="Full Name" value={form.name} onChange={(e) => updateField('name', e.target.value)} error={errors.name} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} error={errors.email} required />
            <Input label="Employee ID" value={form.employeeId} onChange={(e) => updateField('employeeId', e.target.value)} error={errors.employeeId} required />
            <Select label="Department" value={form.department} onChange={(e) => updateField('department', e.target.value)} options={[{ value: '', label: 'Select department' }, ...departments.map((d) => ({ value: d, label: d }))]} error={errors.department} required />
<Select label="Role" value={form.role} onChange={(e) => updateField('role', e.target.value as 'admin' | 'user')} options={[
                { value: 'user', label: 'User' },
                // QA M10: disable the Admin option when demoting would leave
                // no admins — the admin discovers the rule before submitting.
                { value: 'admin', label: 'Admin', disabled: !demoteGuard.ok },
              ]} />
              {!demoteGuard.ok && form.role === 'admin' && (
                <p className="mt-1 text-xs text-warning" role="alert">{demoteGuard.reason}</p>
              )}
              <Select label="Status" value={form.status} onChange={(e) => updateField('status', e.target.value as 'active' | 'inactive')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
              <Select label="Supervisor" value={form.supervisorId || ''} onChange={(e) => updateField('supervisorId', e.target.value || undefined)} options={[{ value: '', label: 'None' }, ...supervisorOptions.map((u) => ({ value: u.id, label: u.name }))]} />
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Supervisor Permissions</h2>
          </div>
          <div className="p-5 space-y-5">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.isSupervisor}
                onChange={(e) => updateField('isSupervisor', e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent focus-visible:ring-accent/20"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Enable Supervisor Capability</p>
                <p className="text-xs text-muted-foreground">This user can review assigned users' timesheets.</p>
              </div>
            </label>
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Security</h2>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <label htmlFor="edit-user-password" className="mb-1 block text-sm font-medium text-foreground">New Password</label>
              <div className="relative">
                <input
                  id="edit-user-password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 pr-10 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 ${errors.password ? 'border-destructive focus:border-destructive focus-visible:ring-destructive/20' : 'border-border focus:border-accent focus-visible:ring-accent/20'}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? (
                <p className="mt-1 text-sm text-destructive" role="alert">{errors.password}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Leave blank to keep the current password. At least 8 characters with an uppercase letter, lowercase letter, and number.</p>
              )}
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(`/admin/users/${user.id}`)}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>Save Changes</Button>
        </div>
      </form>
    </div>
  )
}
