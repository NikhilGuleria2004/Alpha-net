import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { validateEmail, validatePassword } from '../../utils/validation'
import type { CreateUserInput } from '../../types/user'

export function CreateUser() {
  const { createUser, users } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)

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
    if (!form.password) {
      newErrors.password = 'Password is required'
    } else {
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
      await createUser(form)
      addToast('success', 'User created successfully')
      navigate('/admin/users')
    } catch {
      addToast('error', 'Failed to create user')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin/users')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Create New User</h1>
          <p className="mt-1 text-sm text-muted-foreground">Add a new team member to Eniac.</p>
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
            <div>
              <label htmlFor="create-user-password" className="mb-1 block text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <input
                  id="create-user-password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-indigo-500 focus:ring-indigo-500'}`}
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
                <p className="mt-1 text-sm text-red-600" role="alert">{errors.password}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">At least 8 characters with an uppercase letter, lowercase letter, and number. Share it with the user so they can sign in.</p>
              )}
            </div>
            <Select label="Department" value={form.department} onChange={(e) => updateField('department', e.target.value)} options={[{ value: '', label: 'Select department' }, ...departments.map((d) => ({ value: d, label: d }))]} error={errors.department} required />
             <Select label="Role" value={form.role} onChange={(e) => updateField('role', e.target.value as 'admin' | 'user')} options={[{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }]} />
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
                className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Enable Supervisor Capability</p>
                <p className="text-xs text-muted-foreground">This user can review assigned users' timesheets.</p>
              </div>
            </label>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/users')}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>Create User</Button>
        </div>
      </form>
    </div>
  )
}
