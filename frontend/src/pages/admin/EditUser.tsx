import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { validateEmail } from '../../utils/validation'
import type { CreateUserInput } from '../../types/user'

export function EditUser() {
  const { userId } = useParams<{ userId: string }>()
  const { users, updateUser, refreshUsers } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
  })

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
      })
    }
  }, [user])

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
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
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      await updateUser(user.id, form)
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
          <h1 className="text-2xl font-semibold text-slate-900">Edit User</h1>
          <p className="mt-1 text-sm text-slate-500">Update user details and permissions.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">User Information</h2>
          </div>
          <div className="p-5 space-y-5">
            <Input label="Full Name" value={form.name} onChange={(e) => updateField('name', e.target.value)} error={errors.name} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} error={errors.email} required />
            <Input label="Employee ID" value={form.employeeId} onChange={(e) => updateField('employeeId', e.target.value)} error={errors.employeeId} required />
            <Select label="Department" value={form.department} onChange={(e) => updateField('department', e.target.value)} options={[{ value: '', label: 'Select department' }, ...departments.map((d) => ({ value: d, label: d }))]} error={errors.department} required />
             <Select label="Role" value={form.role} onChange={(e) => updateField('role', e.target.value as 'admin' | 'user')} options={[{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }]} />
             <Select label="Status" value={form.status} onChange={(e) => updateField('status', e.target.value as 'active' | 'inactive')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
             <Select label="Supervisor" value={form.supervisorId || ''} onChange={(e) => updateField('supervisorId', e.target.value || undefined)} options={[{ value: '', label: 'None' }, ...supervisorOptions.map((u) => ({ value: u.id, label: u.name }))]} />
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Supervisor Permissions</h2>
          </div>
          <div className="p-5 space-y-5">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.isSupervisor}
                onChange={(e) => updateField('isSupervisor', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Enable Supervisor Capability</p>
                <p className="text-xs text-slate-500">This user can review assigned users' timesheets.</p>
              </div>
            </label>
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
