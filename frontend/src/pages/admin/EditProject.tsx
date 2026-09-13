import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/ui/Avatar'
import { validateDateRange } from '../../utils/validation'
import type { CreateProjectInput } from '../../types/project'

export function EditProject() {
  const { projectId } = useParams<{ projectId: string }>()
  const { projects, users, updateProject } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const project = projects.find((p) => p.id === projectId)

  const [form, setForm] = useState<CreateProjectInput>({
    name: '',
    sowNumber: '',
    client: '',
    description: '',
    startDate: '',
    endDate: '',
    deadline: '',
    status: 'draft',
    managerId: '',
    supervisorId: '',
    teamMemberIds: [],
  })

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        sowNumber: project.sowNumber,
        client: project.client,
        description: project.description,
        startDate: project.startDate,
        endDate: project.endDate,
        deadline: project.deadline,
        status: project.status,
        managerId: project.managerId,
        supervisorId: project.supervisorId,
        teamMemberIds: [...project.teamMemberIds],
      })
    }
  }, [project])

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const availableUsers = users.filter((u) => u.status === 'active' && !form.teamMemberIds.includes(u.id))
  const filteredAvailableUsers = availableUsers.filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
  const supervisorOptions = users.filter((u) => u.isSupervisor && u.status === 'active')

  const updateField = (field: keyof CreateProjectInput, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    const requiredFields: (keyof CreateProjectInput)[] = ['name', 'sowNumber', 'client', 'startDate', 'endDate', 'deadline', 'managerId', 'supervisorId']
    for (const field of requiredFields) {
      const value = form[field]
      if (Array.isArray(value) ? value.length === 0 : !value) {
        newErrors[field] = `${field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')} is required`
      }
    }
    const dateValidation = validateDateRange(form.startDate, form.endDate)
    if (!dateValidation.valid) newErrors.endDate = dateValidation.message || ''
    const deadlineValidation = validateDateRange(form.startDate, form.deadline)
    if (!deadlineValidation.valid) newErrors.deadline = deadlineValidation.message || ''
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      await updateProject(project.id, form)
      addToast('success', 'Project updated successfully')
      navigate(`/admin/projects/${project.id}`)
    } catch {
      addToast('error', 'Failed to update project')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(`/admin/projects/${project.id}`)} leftIcon={<ArrowLeft className="h-4 w-4" />} />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Edit Project</h1>
          <p className="mt-1 text-sm text-muted-foreground">Update project details and settings.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Basic Information</h2>
          </div>
          <div className="p-5 space-y-5">
            <Input label="Project Name" value={form.name} onChange={(e) => updateField('name', e.target.value)} error={errors.name} required />
            <Input label="SOW Number" value={form.sowNumber} onChange={(e) => updateField('sowNumber', e.target.value)} error={errors.sowNumber} required />
            <Input label="Client" value={form.client} onChange={(e) => updateField('client', e.target.value)} error={errors.client} required />
            <Textarea label="Description" value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Timeline</h2>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <Input label="Start Date" type="date" value={form.startDate} onChange={(e) => updateField('startDate', e.target.value)} error={errors.startDate} required />
              <Input label="End Date" type="date" value={form.endDate} onChange={(e) => updateField('endDate', e.target.value)} error={errors.endDate} required />
              <Input label="Deadline" type="date" value={form.deadline} onChange={(e) => updateField('deadline', e.target.value)} error={errors.deadline} required />
            </div>
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Project Manager</h2>
          </div>
          <div className="p-5">
            <Select value={form.managerId} onChange={(e) => updateField('managerId', e.target.value)} options={users.filter((u) => u.role === 'admin').map((u) => ({ value: u.id, label: u.name }))} error={errors.managerId} required />
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Team</h2>
          </div>
          <div className="p-5 space-y-4">
              {form.teamMemberIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.teamMemberIds.map((userId) => {
                    const member = users.find((u) => u.id === userId)
                    if (!member) return null
                    return (
                      <div key={userId} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                        <Avatar name={member.name} size="sm" />
                        <span className="text-sm text-foreground">{member.name}</span>
                        <button type="button" onClick={() => updateField('teamMemberIds', form.teamMemberIds.filter((id) => id !== userId))} className="text-muted-foreground hover:text-foreground" aria-label="Remove">×</button>
                      </div>
                    )
                  })}
                </div>
              )}
            <Button type="button" variant="secondary" onClick={() => setIsAddUserOpen(true)}>Add Users</Button>
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold text-foreground">Supervisor</h2>
          </div>
          <div className="p-5">
            <Select value={form.supervisorId} onChange={(e) => updateField('supervisorId', e.target.value)} options={supervisorOptions.map((u) => ({ value: u.id, label: u.name }))} error={errors.supervisorId} placeholder="Select a supervisor" required />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(`/admin/projects/${project.id}`)}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>Save Changes</Button>
        </div>
      </form>

      <Modal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} title="Add Team Members" size="md">
        <div className="p-5 space-y-4">
          <Input placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} autoFocus />
          <div className="max-h-80 overflow-y-auto space-y-2">
            {filteredAvailableUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => { updateField('teamMemberIds', [...form.teamMemberIds, u.id]); setUserSearch('') }}>Add</Button>
              </div>
            ))}
            {filteredAvailableUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No available users found.</p>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
