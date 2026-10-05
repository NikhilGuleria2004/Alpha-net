import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { DatePicker } from '../../components/ui/DatePicker'
import { EmsCard } from '../../components/ems/EmsCard'
import { FormSection } from '../../components/ems/FormSection'
import { getLeaveTypes, createLeaveRequest } from '../../services/hrService'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import type { LeaveType } from '../../types/hr'

export function LeaveNewPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [leaveTypes, setLeaveTypes] = useState<{ value: LeaveType; label: string }[]>([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    type: '' as LeaveType | '',
    startDate: '',
    endDate: '',
    reason: '',
    note: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    getLeaveTypes()
      .then((result) => setLeaveTypes(result.types))
      .catch(() => addToast('error', 'Failed to load leave types'))
      .finally(() => setLoadingTypes(false))
  }, [addToast])

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!form.type) newErrors.type = 'Select a leave type'
    if (!form.startDate) newErrors.startDate = 'Start date is required'
    if (!form.endDate) newErrors.endDate = 'End date is required'
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      newErrors.endDate = 'End date must be after start date'
    }
    if (!form.reason.trim()) newErrors.reason = 'Reason is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (!user) return

    setSubmitting(true)
    try {
      await createLeaveRequest({
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason,
        note: form.note,
      })
      addToast('success', 'Leave request submitted')
      navigate('/me/leave')
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New Leave Request</h1>
        <p className="mt-1 text-sm text-muted-foreground">Submit a new leave request for approval</p>
      </div>

      <form onSubmit={handleSubmit}>
        <EmsCard>
          <FormSection title="Leave Details" description="Select the type and dates for your leave">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-foreground mb-1">Leave Type</label>
                <Select
                  id="type"
                  value={form.type}
                  options={[{ value: '', label: 'Select type' }, ...leaveTypes] as Array<{ value: LeaveType | ''; label: string }>}
                  onChange={(e) => handleChange('type', e.target.value as LeaveType | '')}
                  disabled={loadingTypes}
                  aria-invalid={!!errors.type}
                />
                {errors.type && <p className="mt-1 text-sm text-destructive" role="alert">{errors.type}</p>}
              </div>

              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-foreground mb-1">Start Date</label>
                <DatePicker
                  value={form.startDate}
                  onChange={(val) => handleChange('startDate', val)}
                  minDate={new Date().toISOString().split('T')[0]}
                  aria-invalid={!!errors.startDate}
                  error={errors.startDate}
                />
              </div>

              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-foreground mb-1">End Date</label>
                <DatePicker
                  value={form.endDate}
                  onChange={(val) => handleChange('endDate', val)}
                  minDate={form.startDate || new Date().toISOString().split('T')[0]}
                  aria-invalid={!!errors.endDate}
                  error={errors.endDate}
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="reason" className="block text-sm font-medium text-foreground mb-1">Reason</label>
                <Textarea
                  id="reason"
                  value={form.reason}
                  onChange={(e) => handleChange('reason', e.target.value)}
                  placeholder="Brief reason for leave"
                  rows={3}
                  aria-invalid={!!errors.reason}
                  error={errors.reason}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Additional Notes" description="Optional additional context for your manager">
            <Textarea
              id="note"
              value={form.note}
              onChange={(e) => handleChange('note', e.target.value)}
              placeholder="Any additional details (optional)"
              rows={3}
            />
          </FormSection>
        </EmsCard>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/me/leave')}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={submitting || loadingTypes}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </div>
  )
}