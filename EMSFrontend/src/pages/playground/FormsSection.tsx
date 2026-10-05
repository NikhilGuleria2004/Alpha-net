import { useState } from 'react'
import { Search } from 'lucide-react'
import { Section, Row } from './kit'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { DatePicker } from '../../components/ui/DatePicker'
import { Checkbox } from '../../components/ui/Checkbox'
import { Switch } from '../../components/ui/Switch'
import { Button } from '../../components/ui/Button'
import { MoneyInput, RateInput } from '../../components/ems/MoneyInput'
import { FormSection } from '../../components/ems/FormSection'
import { Stepper, type Step } from '../../components/ems/Stepper'

const DEPARTMENT_OPTIONS = [
  { value: '', label: 'Select department…' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'people', label: 'People Ops' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'finance', label: 'Finance' },
  { value: 'legal', label: 'Legal (unavailable)', disabled: true },
]

const WIZARD_STEPS: Step[] = [
  { id: 'identity', label: 'Identity', description: 'Name, email, employee ID', state: 'done' },
  { id: 'role', label: 'Role & department', description: 'Reporting line, job title', state: 'done' },
  { id: 'pay', label: 'Pay & billable', description: 'Rate, currency, billable flag', state: 'current' },
  { id: 'docs', label: 'Documents', description: 'Contract, ID proof', state: 'todo', hasError: true },
  { id: 'review', label: 'Review', description: 'Confirm and invite', state: 'todo' },
]

/** Every form control in every state. */
export function FormsSection() {
  const [text, setText] = useState('Hina Rao')
  const [checked, setChecked] = useState(true)
  const [switched, setSwitched] = useState(true)
  const [rate, setRate] = useState<number | null>(85)
  const [currency, setCurrency] = useState<'USD' | 'INR' | 'EUR' | 'GBP'>('USD')
  const [hireDate, setHireDate] = useState('2026-10-01')

  return (
    <Section id="forms" title="Forms" description="Inputs carry label, helper and error slots; errors are wired with aria-describedby.">
      <Row label="Text inputs">
        <div className="grid w-full max-w-xs gap-3 sm:max-w-sm">
          <Input label="Full name" defaultValue="Esha Employee" />
          <Input label="Work email" type="email" defaultValue="esha@eniac.demo" noSpell helperText="Invitation goes here." />
          <Input label="Employee ID" defaultValue="E0001O1" error="Must match E000000 format." noSpell />
          <Input label="Search" leftIcon={<Search className="h-4 w-4" />} placeholder="Search people…" />
          <Input label="Disabled" defaultValue="Read only" disabled />
        </div>
      </Row>
      <Row label="Textarea / date">
        <div className="grid w-full max-w-xs gap-3 sm:max-w-sm">
          <DatePicker label="Hire date" value={hireDate} onChange={setHireDate} />
          <Textarea
            label="Notes"
            showCount
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </Row>
      <Row label="Select">
        <div className="grid w-full max-w-xs gap-3 sm:max-w-sm">
          <Select label="Department" options={DEPARTMENT_OPTIONS} placeholder="Select department…" defaultValue="" />
          <Select label="With error" options={DEPARTMENT_OPTIONS} error="Pick a department." defaultValue="" />
        </div>
      </Row>
      <Row label="Money / rate">
        <div className="grid w-full max-w-xs gap-3 sm:max-w-sm">
          <MoneyInput
            label="Monthly salary"
            value={rate === null ? null : rate * 160}
            onChange={(v) => setRate(v === null ? null : Math.round(v / 160))}
            currency={currency}
            onCurrencyChange={setCurrency}
          />
          <RateInput label="Hourly pay rate" value={rate} onChange={setRate} currency={currency} onCurrencyChange={setCurrency} />
          <RateInput label="Rate with error" value={null} onChange={() => {}} error="Billable employees need a pay rate." />
        </div>
      </Row>
      <Row label="Checkbox / switch">
        <Checkbox checked={checked} onChange={setChecked} label="Include contractors" />
        <Checkbox checked={false} onChange={() => {}} label="Disabled" disabled />
        <Switch checked={switched} onChange={setSwitched} label="Billable" description="Counts toward utilization" />
        <Switch checked={false} onChange={() => {}} label="Disabled switch" disabled />
      </Row>
      <Row label="Stepper (vertical)">
        <Stepper steps={WIZARD_STEPS} onStepClick={() => {}} />
      </Row>
      <Row label="Stepper (horizontal)">
        <Stepper
          orientation="horizontal"
          steps={WIZARD_STEPS.map((s) => ({ ...s, description: undefined }))}
        />
      </Row>
      <FormSection
        title="Compensation"
        description="Only visible to HR and admin roles."
        action={<Button variant="ghost" size="sm">History</Button>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <RateInput label="Pay rate" value={rate} onChange={setRate} currency={currency} onCurrencyChange={setCurrency} />
          <Switch checked={switched} onChange={setSwitched} label="Billable" description="Client-facing work" />
        </div>
      </FormSection>
      <FormSection
        title="Section with validation error"
        error="Pay rate is required for billable employees."
      >
        <RateInput label="Pay rate" value={null} onChange={() => {}} error="Pay rate is required." />
      </FormSection>
    </Section>
  )
}
