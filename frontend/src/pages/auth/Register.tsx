import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { validateEmail, validatePassword, validateRequired } from '../../utils/validation'
import { register } from '../../services/authService'

type RegistrationRole = 'user' | 'admin'

interface RegistrationForm {
  name: string
  email: string
  employeeId: string
  department: string
  password: string
  confirmPassword: string
  role: RegistrationRole
  adminPass: string
}

const departments = ['Engineering', 'Design', 'Marketing', 'Sales', 'QA', 'Finance', 'HR']

export function Register() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<RegistrationForm>({
    name: '',
    email: '',
    employeeId: '',
    department: '',
    password: '',
    confirmPassword: '',
    role: 'user',
    adminPass: '',
  })

  const updateField = <K extends keyof RegistrationForm>(field: K, value: RegistrationForm[K]) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    if (errors[field]) {
      setErrors((previous) => ({ ...previous, [field]: '' }))
    }
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    const requiredFields: Array<'name' | 'email' | 'employeeId' | 'department' | 'password' | 'confirmPassword'> = ['name', 'email', 'employeeId', 'department', 'password', 'confirmPassword']

    for (const field of requiredFields) {
      const result = validateRequired(form[field], field === 'employeeId' ? 'Employee ID' : field.charAt(0).toUpperCase() + field.slice(1))
      if (!result.valid) {
        newErrors[field] = result.message || ''
      }
    }

    const emailValidation = validateEmail(form.email)
    if (!emailValidation.valid) {
      newErrors.email = emailValidation.message || ''
    }

    const passwordValidation = validatePassword(form.password)
    if (!passwordValidation.valid) {
      newErrors.password = passwordValidation.message || ''
    }

    if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    if (form.role === 'admin' && !form.adminPass.trim()) {
      newErrors.adminPass = 'Admin pass is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    setErrors({})
    try {
      await register({
        name: form.name,
        email: form.email,
        employeeId: form.employeeId,
        department: form.department,
        password: form.password,
        confirmPassword: form.confirmPassword,
        role: form.role,
        adminPass: form.role === 'admin' ? form.adminPass : undefined,
      })
      addToast('success', 'Account created successfully')
      navigate(form.role === 'admin' ? '/adminlog' : '/userlog')
    } catch {
      setErrors({ general: 'Unable to create account. Please check the details and try again.' })
      addToast('error', 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-muted">
      <div className="hidden w-1/2 bg-slate-900 lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600">
            <span className="text-3xl font-bold text-white">A</span>
          </div>
          <h1 className="text-4xl font-bold text-white">Join Eniac</h1>
          <p className="mt-4 text-lg text-slate-300">Create your account and start managing projects, people, and time in one place.</p>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-12">
        <div className="mx-auto w-full max-w-xl">
          <Button type="button" variant="ghost" onClick={() => navigate('/userlog')} leftIcon={<ArrowLeft className="h-4 w-4" />} className="mb-6">
            Back to sign in
          </Button>
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Create your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">Register as a team member or request an administrator account.</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {errors.general && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {errors.general}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <Input label="Full Name" value={form.name} onChange={(event) => updateField('name', event.target.value)} error={errors.name} required autoComplete="name" />
              <Input label="Work Email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} error={errors.email} required autoComplete="email" placeholder="you@eniac.com" />
              <Input label="Employee ID" value={form.employeeId} onChange={(event) => updateField('employeeId', event.target.value)} error={errors.employeeId} required autoComplete="off" />
              <Select label="Department" value={form.department} onChange={(event) => updateField('department', event.target.value)} options={[{ value: '', label: 'Select department' }, ...departments.map((department) => ({ value: department, label: department }))]} error={errors.department} required />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="register-password">Password</label>
                <div className="relative">
                  <input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-indigo-500 focus:ring-indigo-500'}`}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.password)}
                  />
                  <button type="button" onClick={() => setShowPassword((previous) => !previous)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password ? <p className="mt-1 text-sm text-red-600" role="alert">{errors.password}</p> : <p className="mt-1 text-xs text-muted-foreground">Use at least 8 characters with uppercase, lowercase, and a number.</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="register-confirm-password">Confirm Password</label>
                <div className="relative">
                  <input
                    id="register-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(event) => updateField('confirmPassword', event.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${errors.confirmPassword ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-border focus:border-indigo-500 focus:ring-indigo-500'}`}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.confirmPassword)}
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((previous) => !previous)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground" aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}>
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="mt-1 text-sm text-red-600" role="alert">{errors.confirmPassword}</p>}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Select label="Account Type" value={form.role} onChange={(event) => updateField('role', event.target.value as RegistrationRole)} options={[{ value: 'user', label: 'Team Member' }, { value: 'admin', label: 'Administrator' }]} required />
              {form.role === 'admin' && (
                <Input label="Admin Pass" type="password" value={form.adminPass} onChange={(event) => updateField('adminPass', event.target.value)} error={errors.adminPass} required autoComplete="off" />
              )}
            </div>

            {form.role === 'admin' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Administrator registration is available only when an administrator pass is configured on the server.
              </div>
            )}

            <Button type="submit" loading={isLoading} disabled={isLoading} className="w-full">
              Create Account
            </Button>

            <p className="text-center text-sm text-foreground">
              Already have an account?{' '}
              <button type="button" onClick={() => navigate('/userlog')} className="font-medium text-indigo-600 hover:text-indigo-700">
                Sign in
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
