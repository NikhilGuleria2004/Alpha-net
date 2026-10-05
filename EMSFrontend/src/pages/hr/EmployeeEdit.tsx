/**
 * Employee edit page (EMSFrontend.md §7.5, Phase 5 5.4).
 * Sectioned form mirroring the onboarding wizard, with admin guardrails and
 * audit-trail payrate changes.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { FormSection } from '../../components/ems/FormSection'
import { BillableChip } from '../../components/ems/BillableChip'
import { RoleBadge } from '../../components/ems/RoleBadge'
import { canDeactivateUser } from '../../utils/permissions'
import { getDepartments, getEmployeeDetail, getEmployees, updateEmployee } from '../../services/hrService'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useEmployeeBase } from '../../hooks/useEmployeeBase'
import type { EmsUser, SupportedCurrencyCode, UserRole } from '../../types/auth'
import type { UpdateUserInput } from '../../types/user'
import { formatMoney } from '../../utils/currency'
import { ArrowLeft } from 'lucide-react'

const ROLES: { value: string; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'hr', label: 'HR' },
  { value: 'admin', label: 'Admin' },
]

const EMPLOYMENT_TYPES: { value: string; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
]

const STATUSES: { value: string; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'invited', label: 'Invited' },
  { value: 'on_leave', label: 'On Leave' },
]

export function HrEmployeeEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const employeeBase = useEmployeeBase()
  const { addToast } = useToast()
  const [user, setUser] = useState<EmsUser | null>(null)
  const [directory, setDirectory] = useState<EmsUser[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getEmployeeDetail(id)
      .then((res) => {
        if (cancelled) return
        setUser(res.user)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(true)
        addToast('error', err instanceof Error ? err.message : 'Failed to load employee')
      })
    getEmployees()
      .then((res) => {
        if (!cancelled) setDirectory(res.users)
      })
      .catch(() => undefined)
    getDepartments()
      .then((res) => {
        if (!cancelled) setDepartments(res.departments)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [id, addToast])

  useEffect(() => {
    if (loadError) navigate(employeeBase)
  }, [loadError, navigate])

  if (!user) {
    return (
      <div className="p-4">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-lg border border-border" />
          <div className="h-10 animate-pulse rounded-lg border border-border" />
          <div className="h-10 animate-pulse rounded-lg border border-border" />
        </div>
      </div>
    )
  }

  function updateField<K extends keyof EmsUser>(key: K, value: EmsUser[K]) {
    setUser((prev) => prev ? { ...prev, [key]: value } : prev)
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

   function validate(): boolean {
    if (!user) return false
    const newErrors: Record<string, string> = {}
    if (user.billable && !user.payRate) {
      newErrors.payRate = 'Billable employees must have a pay rate.'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSave() {
    if (!validate() || !user) return
    const edited = user
    const input: UpdateUserInput = {
      name: edited.name,
      employeeId: edited.employeeId,
      department: edited.department ?? '',
      role: edited.role,
      title: edited.title,
      employmentType: edited.employmentType,
      billable: edited.billable,
      payRate: edited.billable ? edited.payRate ?? undefined : undefined,
      currency: edited.currency,
      managerId: edited.managerId,
      supervisorId: edited.supervisorId,
      status: edited.status,
    }
    setSaving(true)
    updateEmployee(edited.id, input)
      .then((res) => {
        setUser(res.user)
        navigate(`${employeeBase}/${edited.id}`)
      })
      .catch((err) => {
        addToast('error', err instanceof Error ? err.message : 'Could not save changes.')
      })
      .finally(() => setSaving(false))
  }

  const adminCount = directory.filter((u) => u.role === 'admin' && u.status === 'active').length
  const deactivateCheck: { ok: boolean; reason?: string } = currentUser
    ? canDeactivateUser(currentUser, user, directory)
    : { ok: true }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <Link to={`${employeeBase}/${user.id}`} aria-label="Back to employee detail">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Edit {user.name}</h1>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <RoleBadge role={user.role} />
        <BillableChip billable={user.billable} />
        {user.payRate && <span className="ems-tabular text-sm text-muted-foreground">{formatMoney(user.payRate, user.currency!)}/h</span>}
        {user.status === 'active' && !deactivateCheck.ok && (
          <span className="text-xs text-destructive" title={deactivateCheck.reason}>Protected: cannot deactivate last active admin</span>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSave() }}>
        <FormSection title="Identity" description="Legal name and contact information." error={errors.name || errors.email}>
          <Input id="name" label="Legal Name *" value={user.name} onChange={(e) => updateField('name', e.target.value)} error={errors.name} required />
          <Input id="email" label="Email *" value={user.email} onChange={(e) => updateField('email', e.target.value)} error={errors.email} required type="email" noSpell />
        </FormSection>

        <FormSection title="Employment" description="Role, department, and reporting." className="mt-4" error={errors.department || errors.employeeId}>
          <Input id="employeeId" label="Employee ID" value={user.employeeId} onChange={(e) => updateField('employeeId', e.target.value)} error={errors.employeeId} />

          <Select
            id="role"
            label="Role *"
            value={user.role}
            options={ROLES}
            onChange={(e) => {
              const role = e.target.value as UserRole
              updateField('role', role)
              if (role === 'employee') updateField('billable', true)
              else updateField('billable', false)
            }}
          />

          <Input id="department" label="Department" value={user.department ?? ''} onChange={(e) => updateField('department', e.target.value)} error={errors.department} list="departments" />
          <datalist id="departments">
            {departments.map((d) => <option key={d} value={d} />)}
          </datalist>

          <Input id="title" label="Job Title" value={user.title ?? ''} onChange={(e) => updateField('title', e.target.value)} />

          <Select
            id="employmentType"
            label="Employment Type"
            value={user.employmentType ?? 'full_time'}
            options={EMPLOYMENT_TYPES}
            onChange={(e) => updateField('employmentType', e.target.value as EmsUser['employmentType'])}
          />

          <Select
            id="status"
            label="Status"
            value={user.status}
            options={STATUSES}
            onChange={(e) => updateField('status', e.target.value as EmsUser['status'])}
          />

          {user.role === 'admin' && user.status === 'active' && adminCount === 1 && (
            <p className="text-xs text-destructive">This is the only active admin. Deactivation is blocked.</p>
          )}
        </FormSection>

        <FormSection title="Billing & Pay" description="Pay rate and currency settings." className="mt-4" error={errors.payRate}>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={user.billable}
              onChange={(e) => {
                const billable = e.target.checked
                updateField('billable', billable)
                if (!billable) {
                  updateField('payRate', null)
                }
              }}
              className="h-4 w-4 rounded border-border text-accent focus-visible:ring-accent"
            />
            <span className="text-sm font-medium text-foreground">Billable resource</span>
          </label>

          {user.billable && (
            <>
              <Input
                id="payRate"
                label="Pay Rate *"
                type="number"
                value={user.payRate ?? ''}
                onChange={(e) => updateField('payRate', e.target.value ? Number(e.target.value) : null)}
                error={errors.payRate}
                placeholder="85.00"
                min="0"
                step="0.01"
              />
              <Select
                id="currency"
                label="Currency"
                value={user.currency ?? 'USD'}
                options={[
                  { value: 'USD', label: 'USD' },
                  { value: 'INR', label: 'INR' },
                  { value: 'EUR', label: 'EUR' },
                  { value: 'GBP', label: 'GBP' },
                ]}
                onChange={(e) => updateField('currency', e.target.value as SupportedCurrencyCode)}
              />
            </>
          )}
        </FormSection>

        <FormSection title="Access & Reporting" description="Manager assignment." className="mt-4">
          <Input id="managerId" label="Manager ID" value={user.managerId ?? ''} onChange={(e) => updateField('managerId', e.target.value || undefined)} placeholder="e.g. u-manager" />
        </FormSection>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <Link to={`${employeeBase}/${user.id}`}>
            <Button variant="secondary" type="button">Cancel</Button>
          </Link>
          <Button type="submit" loading={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}
    
