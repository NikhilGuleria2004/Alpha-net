/**
 * Onboarding wizard (EMSFrontend.md §7.4, Phase 5 5.1).
 *
 * Guided, multi-step capture of a complete employee record. 6 steps:
 * 1. Identity 2. Employment 3. Billing & Pay 4. Compliance & Documents
 * 5. Access & Roles 6. Review & Confirm.
 *
 * Features: Stepper rail, draft save, unsaved-changes guard, per-step validation,
 * inline error summary, payrate-required-when-billable, review + confirm.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Stepper } from '../../components/ems/Stepper'
import { FormSection } from '../../components/ems/FormSection'
import { RateInput } from '../../components/ems/MoneyInput'
import { formatMoney } from '../../utils/currency'
import type { SupportedCurrencyCode } from '../../types/auth'
import { createOnboarding, getEmployees } from '../../services/hrService'

const STEPS = [
  { id: 'identity', label: 'Identity', description: 'Personal & contact' },
  { id: 'employment', label: 'Employment', description: 'Role & department' },
  { id: 'billing', label: 'Billing & Pay', description: 'Pay rate & billable' },
  { id: 'compliance', label: 'Compliance', description: 'Documents' },
  { id: 'access', label: 'Access & Roles', description: 'System access' },
  { id: 'review', label: 'Review & Confirm', description: 'Confirm details' },
] as const

export type WizardStepId = (typeof STEPS)[number]['id']

const STEP_INDEX: Record<WizardStepId, number> = {
  identity: 0,
  employment: 1,
  billing: 2,
  compliance: 3,
  access: 4,
  review: 5,
}

export interface WizardData {
  // Step 1: Identity
  legalName: string
  preferredName: string
  email: string
  personalEmail: string
  phone: string
  dateOfBirth: string
  gender: string
  address: string
  // Step 2: Employment
  employeeId: string
  role: string
  department: string
  title: string
  managerId: string
  employmentType: string
  startDate: string
  workLocation: string
  // Step 3: Billing & Pay
  billable: boolean
  payRate: number | null
  currency: string
  payFrequency: string
  // Step 4: Compliance (file drops mocked)
  documents: { kind: string; name: string; size: number }[]
  // Step 5: Access & Roles
  systemRoles: string[]
  inviteMethod: 'invite' | 'set_password'
  twoFactorNote: string
}

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
]

const ROLES = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'hr', label: 'HR' },
]

const PAY_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
]

// Convenience payload for quick demos/testing. Email is the seeded address
// requested by the test harness; the remaining fields are static dummy data
// that satisfies every step's validation so the wizard can be completed in
// one click.
const DUMMY_WIZARD_DATA: WizardData = {
  legalName: 'Demo Employee',
  preferredName: 'Demo',
  email: 'kaptaanzirakpur@gmail.com',
  personalEmail: 'demo.personal@example.com',
  phone: '+1 (555) 123-4567',
  dateOfBirth: '1990-04-15',
  gender: 'non_binary',
  address: '123 Demo Street, Portland, OR 97201',
  employeeId: 'DEMO-0001',
  role: 'employee',
  department: 'engineering',
  title: 'Senior Widget Engineer',
  managerId: '',
  employmentType: 'full_time',
  startDate: '2026-10-15',
  workLocation: 'Remote',
  billable: true,
  payRate: 9500,
  currency: 'USD',
  payFrequency: 'biweekly',
  documents: [],
  systemRoles: ['employee'],
  inviteMethod: 'invite',
  twoFactorNote: 'Enforced on first login',
}

function validateStep(stepId: WizardStepId, data: WizardData): Record<string, string> {
  const errors: Record<string, string> = {}
  switch (stepId) {
    case 'identity':
      if (!data.legalName.trim()) errors.legalName = 'Legal name is required.'
      if (!data.email.trim()) errors.email = 'Email is required.'
      else if (!/\S+@\S+\.\S+/.test(data.email)) errors.email = 'Enter a valid email address.'
      break
    case 'employment':
      if (!data.employeeId.trim()) errors.employeeId = 'Employee ID is required.'
      if (!data.role) errors.role = 'Select a role.'
      if (!data.department) errors.department = 'Select a department.'
      if (!data.title.trim()) errors.title = 'Title is required.'
      if (!data.startDate) errors.startDate = 'Start date is required.'
      break
    case 'billing':
      if (data.billable && data.payRate === null) {
        errors.payRate = 'Pay rate is required for billable employees.'
      }
      break
  }
  return errors
}

function hasErrors(errors: Record<string, string>): boolean {
  return Object.keys(errors).length > 0
}

export function HrOnboardingWizard() {
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [stepParam, setStepParam] = useQueryParamState('step', '1', 'push')
  const currentStep = Math.max(1, Math.min(6, parseInt(stepParam, 10) || 1))

  const [data, setData] = useState<WizardData>({
    legalName: '',
    preferredName: '',
    email: '',
    personalEmail: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    employeeId: '',
    role: 'employee',
    department: '',
    title: '',
    managerId: '',
    employmentType: 'full_time',
    startDate: '',
    workLocation: '',
    billable: true,
    payRate: null,
    currency: 'USD',
    payFrequency: 'biweekly',
    documents: [],
    systemRoles: [],
    inviteMethod: 'invite',
    twoFactorNote: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [draftLoading, setDraftLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Managers come from the live directory: a hardcoded list would hand the
  // wizard ids ('u-manager') that match no real user, silently attaching the
  // new hire to nobody.
  const [managerOptions, setManagerOptions] = useState<Array<{ value: string; label: string }>>([
    { value: '', label: 'None' },
  ])

  useEffect(() => {
    let cancelled = false
    getEmployees()
      .then((res) => {
        if (cancelled) return
        const managers = res.users
          .filter((u) => u.status === 'active')
          .filter((u) => u.role === 'manager' || u.role === 'admin')
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((u) => ({ value: u.id, label: `${u.name}${u.title ? ` — ${u.title}` : ''}` }))
        setManagerOptions([{ value: '', label: 'None' }, ...managers])
      })
      .catch((err) => {
        if (!cancelled) addToast('error', err instanceof Error ? err.message : 'Could not load managers.')
      })
    return () => {
      cancelled = true
    }
  }, [addToast])
  const isSavingDraft = useDelayedLoading(draftLoading)

  const isDirty = JSON.stringify(data) !== JSON.stringify(getEmptyData())
  const navigateBlockBypass = useRef(false)
  useUnsavedChanges(isDirty, navigateBlockBypass)

  // Draft save / load from localStorage
  useEffect(() => {
    const key = 'onboarding_draft'
    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        setData(JSON.parse(saved) as WizardData)
      } catch {
        // corrupt draft — ignore
      }
    }
  }, [])

  useEffect(() => {
    const key = 'onboarding_draft'
    localStorage.setItem(key, JSON.stringify(data))
  }, [data])

  function getEmptyData(): WizardData {
    return {
      legalName: '',
      preferredName: '',
      email: '',
      personalEmail: '',
      phone: '',
      dateOfBirth: '',
      gender: '',
      address: '',
      employeeId: '',
      role: 'employee',
      department: '',
      title: '',
      managerId: '',
      employmentType: 'full_time',
      startDate: '',
      workLocation: '',
      billable: true,
      payRate: null,
      currency: 'USD',
      payFrequency: 'biweekly',
      documents: [],
      systemRoles: [],
        inviteMethod: 'invite',
      twoFactorNote: '',
    }
  }

  const stepId = STEPS[currentStep - 1]!.id

  function updateField<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  function handleStepClick(id: string) {
    const target = STEP_INDEX[id as WizardStepId] + 1
    setStepParam(String(target))
  }

  function next() {
    const stepErrors = validateStep(stepId, data)
    setErrors(stepErrors)
    if (hasErrors(stepErrors)) return
    if (currentStep < 6) setStepParam(String(currentStep + 1))
  }

  function back() {
    if (currentStep > 1) setStepParam(String(currentStep - 1))
  }

  function handleSaveDraft() {
    setDraftLoading(true)
    setTimeout(() => {
      setDraftLoading(false)
      addToast('info', 'Draft saved. You can resume later.')
    }, 500)
  }

  const handleFillDemo = () => {
    setData(DUMMY_WIZARD_DATA)
    setErrors({})
    setStepParam('1')
  }

  async function handleConfirm() {
    const stepErrors = validateStep('billing', data)
    setErrors(stepErrors)
    if (hasErrors(stepErrors)) return

    try {
       setSubmitting(true)
       await createOnboarding({
        name: data.preferredName || data.legalName,
        email: data.email,
        employeeId: data.employeeId,
        department: data.department,
        role: data.role as 'admin' | 'hr' | 'manager' | 'employee',
        billable: data.billable,
        payRate: data.billable ? (data.payRate ?? undefined) : undefined,
        currency: data.currency as SupportedCurrencyCode,
      })

       localStorage.removeItem('onboarding_draft')
      setData(getEmptyData())
      navigateBlockBypass.current = true
      addToast('success', `${data.legalName || data.preferredName} has been added to onboarding.`)
      navigate('/hr/onboarding')
    } catch {
      addToast('error', 'Failed to create onboarding candidate. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      const firstKey = Object.keys(errors)[0]
      if (!firstKey) return
      const el = document.getElementById(firstKey)
      if (el) {
        el.focus()
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [errors])

  function updateDocuments(docs: { kind: string; name: string; size: number }[]) {
    setData((prev) => ({ ...prev, documents: docs }))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">New Hire Onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.legalName ? `Onboarding: ${data.legalName}` : 'Enter the new hire details below.'}</p>
         <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          aria-label="Fill form with demo data"
          leftIcon={<Info className="h-4 w-4" />}
          onClick={handleFillDemo}
        >
          Fill demo data (test)
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <nav className="lg:col-span-3" aria-label="Onboarding steps">
          <Stepper
            steps={STEPS.map((s) => ({
              id: s.id,
              label: s.label,
              description: s.description,
              state: currentStep > STEP_INDEX[s.id] + 1 ? 'done' : currentStep === STEP_INDEX[s.id] + 1 ? 'current' : 'todo',
              hasError: stepId === s.id && Object.keys(errors).length > 0,
            }))}
            onStepClick={handleStepClick}
            orientation="vertical"
          />
        </nav>

        <main className="lg:col-span-9">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (currentStep === 6) handleConfirm()
              else next()
            }}
          >
            {currentStep === 1 && renderIdentityStep()}
            {currentStep === 2 && renderEmploymentStep()}
            {currentStep === 3 && renderBillingStep()}
            {currentStep === 4 && renderComplianceStep()}
            {currentStep === 5 && renderAccessStep()}
            {currentStep === 6 && renderReviewStep()}

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <Button type="button" variant="secondary" onClick={back} disabled={currentStep === 1}>
                Back
              </Button>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
          variant="secondary"
                  onClick={handleSaveDraft}
                  loading={isSavingDraft}
                  aria-busy={isSavingDraft}
                >
                  Save Draft
                </Button>
                {currentStep < 6 ? (
                  <Button type="submit" onClick={() => setErrors(validateStep(stepId, data))}>
                    Save & Continue
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                    Create Employee
                  </Button>
                )}
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  )

  function renderIdentityStep() {
    return (
      <>
        <FormSection title="Identity" description="Legal and preferred names, primary contact." error={errors.legalName || errors.email}>
          <Input id="legalName" label="Legal Name *" onChange={(e) => updateField('legalName', e.target.value)} value={data.legalName} error={errors.legalName} required />
          <Input id="preferredName" label="Preferred Name" onChange={(e) => updateField('preferredName', e.target.value)} value={data.preferredName} />
          <Input id="email" label="Work Email *" onChange={(e) => updateField('email', e.target.value)} value={data.email} error={errors.email} required type="email" />
          <Input id="personalEmail" label="Personal Email" onChange={(e) => updateField('personalEmail', e.target.value)} value={data.personalEmail} type="email" />
          <Input id="phone" label="Phone" onChange={(e) => updateField('phone', e.target.value)} value={data.phone} type="tel" />
          <Input id="dateOfBirth" label="Date of Birth" type="date" onChange={(e) => updateField('dateOfBirth', e.target.value)} value={data.dateOfBirth} />
        </FormSection>

        <FormSection title="Address & Demographics" description="" className="mt-4">
          <Input id="gender" label="Gender" value={data.gender} onChange={(e) => updateField('gender', e.target.value)} />
          <Input id="address" label="Address" value={data.address} onChange={(e) => updateField('address', e.target.value)} />
        </FormSection>
      </>
    )
  }

  function renderEmploymentStep() {
    return (
      <>
        <FormSection title="Employment" description="Role, department, reporting lines." error={errors.employeeId || errors.role || errors.department || errors.title || errors.startDate}>
          <Input id="employeeId" label="Employee ID *" value={data.employeeId} onChange={(e) => updateField('employeeId', e.target.value)} error={errors.employeeId} placeholder="E000###" required />
          <Select
            id="role"
            label="Role *"
            value={data.role}
            options={ROLES}
            onChange={(e) => {
              const role = e.target.value
              updateField('role', role)
              // Auto-set billable default for employee role.
              if (role === 'employee') updateField('billable', true)
              else updateField('billable', false)
            }}
            error={errors.role}
            required
          />
          <Input id="department" label="Department *" value={data.department} onChange={(e) => updateField('department', e.target.value)} error={errors.department} placeholder="Select or type a department" required />
          <Input id="title" label="Job Title *" value={data.title} onChange={(e) => updateField('title', e.target.value)} error={errors.title} required />
          <Select id="managerId" label="Manager" value={data.managerId} options={managerOptions} onChange={(e) => updateField('managerId', e.target.value)} />
          <Select id="employmentType" label="Employment Type" value={data.employmentType} options={EMPLOYMENT_TYPES} onChange={(e) => updateField('employmentType', e.target.value)} />
          <Input id="startDate" label="Start Date *" type="date" value={data.startDate} onChange={(e) => updateField('startDate', e.target.value)} error={errors.startDate} required />
          <Input id="workLocation" label="Work Location" value={data.workLocation} onChange={(e) => updateField('workLocation', e.target.value)} placeholder="e.g. Bangalore, Hybrid" />
        </FormSection>
      </>
    )
  }

  function renderBillingStep() {
    return (
      <FormSection
        title="Billing & Pay"
        description="Billable flag controls rate requirements and timesheet platform access."
        error={errors.payRate}
      >
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.billable}
            onChange={(e) => updateField('billable', e.target.checked)}
            className="h-4 w-4 rounded border-border text-accent focus-visible:ring-accent"
          />
          <span className="text-sm font-medium text-foreground">Billable resource</span>
        </label>
        <p className="text-xs text-muted-foreground">Billable employees must have a pay rate set. Non-billable roles skip rate capture.</p>

        {data.billable && (
          <>
            <RateInput
              label="Pay Rate *"
              value={data.payRate}
              onChange={(v) => updateField('payRate', v)}
              currency={data.currency as SupportedCurrencyCode}
              error={errors.payRate}
              placeholder="85.00"
              helperText="Per hour"
            />
            <Select id="currency" label="Currency" value={data.currency} options={[
              { value: 'USD', label: 'USD' },
              { value: 'INR', label: 'INR' },
              { value: 'EUR', label: 'EUR' },
              { value: 'GBP', label: 'GBP' },
            ]} onChange={(e) => updateField('currency', e.target.value)} />
            <Select id="payFrequency" label="Pay Frequency" value={data.payFrequency} options={PAY_FREQUENCIES} onChange={(e) => updateField('payFrequency', e.target.value)} />
          </>
        )}
      </FormSection>
    )
  }

  function renderComplianceStep() {
    return (
      <FormSection title="Compliance & Documents" description="ID, contract, and tax forms.">
        <div className="space-y-3">
          {(['id_proof', 'contract', 'tax_form'] as const).map((kind) => {
            const uploaded = data.documents.find((d) => d.kind === kind)
            return (
              <div key={kind} className="flex items-center justify-between rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-foreground">{kind.replace('_', ' ').toUpperCase()}</span>
                  <p className="text-xs text-muted-foreground">{uploaded ? uploaded.name : 'Dropzone — uploads mocked'}</p>
                </div>
                <label className="cursor-pointer text-xs font-medium text-accent">
                  <input
                    type="file"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      updateDocuments([...data.documents.filter((d) => d.kind !== kind), { kind, name: file.name, size: file.size }])
                    }}
                  />
                  {uploaded ? 'Change' : 'Upload'}
                </label>
              </div>
            )
          })}
        </div>
      </FormSection>
    )
  }

  function renderAccessStep() {
    return (
      <FormSection title="Access & Roles" description="System access, invitations, and 2FA.">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.systemRoles.includes('admin')}
            onChange={(e) => {
              const roles = e.target.checked ? ['admin', ...data.systemRoles.filter((r) => r !== 'admin')] : data.systemRoles.filter((r) => r !== 'admin')
              updateField('systemRoles', roles)
            }}
            className="h-4 w-4 rounded border-border text-accent focus-visible:ring-accent"
          />
          <span className="text-sm text-foreground">Admin access (requires approval)</span>
        </label>

        <fieldset className="flex gap-3">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="inviteMethod"
              value="invite"
              checked={data.inviteMethod === 'invite'}
              onChange={() => updateField('inviteMethod', 'invite')}
              className="h-4 w-4 border-border text-accent focus-visible:ring-accent"
            />
            <span className="text-sm text-foreground">Send invite email</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="inviteMethod"
              value="set_password"
              checked={data.inviteMethod === 'set_password'}
              onChange={() => updateField('inviteMethod', 'set_password')}
              className="h-4 w-4 border-border text-accent focus-visible:ring-accent"
            />
            <span className="text-sm text-foreground">Set password now</span>
          </label>
        </fieldset>

        <Input
          id="twoFactorNote"
          label="2FA Note"
          value={data.twoFactorNote}
          onChange={(e) => updateField('twoFactorNote', e.target.value)}
          placeholder="e.g. Required for admin access"
        />
      </FormSection>
    )
  }

  function renderReviewStep() {
    const billableRate = data.billable ? formatMoney(data.payRate ?? 0, data.currency as 'USD') + '/h' : '—'
    return (
      <FormSection title="Review & Confirm" description="Verify all details before creating the employee." error={errors.payRate}>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-[120px_1fr] gap-1">
            <span className="text-muted-foreground">Legal Name</span>
            <span className="font-medium text-foreground">{data.legalName || '—'}</span>
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium text-foreground">{data.email || '—'}</span>
            <span className="text-muted-foreground">Employee ID</span>
            <span className="font-medium text-foreground">{data.employeeId || '—'}</span>
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium text-foreground">{data.role}</span>
            <span className="text-muted-foreground">Department</span>
            <span className="font-medium text-foreground">{data.department || '—'}</span>
            <span className="text-muted-foreground">Manager</span>
            <span className="font-medium text-foreground">{data.managerId || '—'}</span>
            <span className="text-muted-foreground">Employment Type</span>
            <span className="font-medium text-foreground">{data.employmentType.replace('_', ' ')}</span>
            <span className="text-muted-foreground">Start Date</span>
            <span className="font-medium text-foreground">{data.startDate || '—'}</span>
            <span className="text-muted-foreground">Billable</span>
            <span className="font-medium text-foreground">{data.billable ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Pay Rate</span>
            <span className="font-medium text-foreground">{billableRate}</span>
            <span className="text-muted-foreground">Currency</span>
            <span className="font-medium text-foreground">{data.currency}</span>
            <span className="text-muted-foreground">Pay Frequency</span>
            <span className="font-medium text-foreground">{data.payFrequency}</span>
            <span className="text-muted-foreground">Documents</span>
            <span className="font-medium text-foreground">{data.documents.length} uploaded</span>
            <span className="text-muted-foreground">Invite Method</span>
            <span className="font-medium text-foreground">{data.inviteMethod === 'invite' ? 'Email invite' : 'Set password'}</span>
          </div>
        </div>
      </FormSection>
    )
  }
}
