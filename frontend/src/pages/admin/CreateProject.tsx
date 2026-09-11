import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, ArrowLeft } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Select } from '../../components/ui/Select'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Avatar } from '../../components/ui/Avatar'
import { validateDateRange, validateDeadlineRange } from '../../utils/validation'
import { uploadProjectDocument } from '../../services/documentService'
import type { CreateProjectInput } from '../../types/project'

// Holds the actual File objects (not display metadata) so they can be uploaded
// to the created project — previously they were discarded on submit (C4).
type SelectedDocument = { id: string; file: File }

export function CreateProject() {
  const { createProject, users } = useAppData()
  const { user: currentUser } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState<CreateProjectInput>({
    name: '',
    sowNumber: '',
    client: '',
    description: '',
    startDate: '',
    endDate: '',
    deadline: '',
    status: 'draft',
    managerId: currentUser?.id || '',
    supervisorId: '',
    teamMemberIds: [],
  })

  const [documents, setDocuments] = useState<SelectedDocument[]>([])

  const availableUsers = users.filter((u) => u.status === 'active' && !form.teamMemberIds.includes(u.id))
  const filteredAvailableUsers = availableUsers.filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
  const supervisorOptions = users.filter((u) => u.isSupervisor && u.status === 'active')

  const updateField = (field: keyof CreateProjectInput, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const addFiles = (files: File[]) => {
    if (!files.length) return
    setDocuments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
      })),
    ])
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
    if (form.teamMemberIds.length === 0) {
      newErrors.teamMemberIds = 'At least one team member is required'
    }
    const dateValidation = validateDateRange(form.startDate, form.endDate)
    if (!dateValidation.valid) newErrors.endDate = dateValidation.message || ''
    const deadlineValidation = validateDeadlineRange(form.startDate, form.deadline, form.endDate)
    if (!deadlineValidation.valid) newErrors.deadline = deadlineValidation.message || ''
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const project = await createProject(form)
      if (documents.length > 0) {
        // Upload all selected files to the just-created project. Failures are
        // reported per-file but don't block navigation (the project itself is
        // already created at this point).
        const results = await Promise.allSettled(documents.map((d) => uploadProjectDocument(project.id, d.file)))
        const failed = results.filter((r) => r.status === 'rejected').length
        if (failed > 0) {
          addToast('warning', `Project created, but ${failed} of ${documents.length} document(s) failed to upload`)
        } else {
          addToast('success', 'Project created with documents')
        }
      } else {
        addToast('success', 'Project created successfully')
      }
      navigate('/admin/projects')
    } catch (err) {
      console.error('Failed to create project:', err)
      const message = err instanceof Error ? err.message : 'Failed to create project'
      addToast('error', message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin/projects')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Create New Project</h1>
          <p className="mt-1 text-sm text-slate-500">Set up a new project or statement of work.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Basic Information</h2>
          </div>
          <div className="p-5 space-y-5">
            <Input label="Project Name" value={form.name} onChange={(e) => updateField('name', e.target.value)} error={errors.name} required />
            <Input label="SOW Number" value={form.sowNumber} onChange={(e) => updateField('sowNumber', e.target.value)} error={errors.sowNumber} required />
            <Input label="Client" value={form.client} onChange={(e) => updateField('client', e.target.value)} error={errors.client} required />
            <Textarea label="Description" value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Timeline</h2>
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
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Project Manager</h2>
          </div>
          <div className="p-5">
            <Select value={form.managerId} onChange={(e) => updateField('managerId', e.target.value)} options={users.filter((u) => u.role === 'admin').map((u) => ({ value: u.id, label: u.name }))} error={errors.managerId} required />
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Team</h2>
          </div>
          <div className="p-5 space-y-4">
            {form.teamMemberIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.teamMemberIds.map((userId) => {
                  const member = users.find((u) => u.id === userId)
                  if (!member) return null
                  return (
                    <div key={userId} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <Avatar name={member.name} size="sm" />
                      <span className="text-sm text-slate-700">{member.name}</span>
                      <button type="button" onClick={() => updateField('teamMemberIds', form.teamMemberIds.filter((id) => id !== userId))} className="text-slate-400 hover:text-slate-600" aria-label="Remove">×</button>
                    </div>
                  )
                })}
              </div>
            )}
            <Button type="button" variant="secondary" onClick={() => setIsAddUserOpen(true)}>Add Users</Button>
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Supervisor</h2>
          </div>
          <div className="p-5">
            <Select value={form.supervisorId} onChange={(e) => updateField('supervisorId', e.target.value)} options={supervisorOptions.map((u) => ({ value: u.id, label: u.name }))} error={errors.supervisorId} placeholder="Select a supervisor" required />
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
          </div>
          <div className="p-5">
            <div
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/50"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-indigo-500') }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('border-indigo-500') }}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-indigo-500')
                const files = Array.from(e.dataTransfer.files)
                addFiles(files)
              }}
            >
              <div className="mb-3 rounded-full bg-indigo-50 p-3 text-indigo-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <p className="text-sm font-medium text-slate-700">Drop files here</p>
              <p className="mt-1 text-xs text-slate-500">or browse from your computer</p>
              <p className="mt-2 text-xs text-slate-400">PDF, DOCX, XLSX, PNG, JPG up to 10MB</p>
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                onChange={(e) => addFiles(Array.from(e.target.files || []))}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="mt-4 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Browse Files
              </label>
            </div>
            {documents.length > 0 && (
              <div className="mt-4 space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{doc.file.name}</p>
                      <p className="text-xs text-slate-500">{(doc.file.size / (1024 * 1024)).toFixed(1)} MB</p>
                    </div>
                    <button type="button" onClick={() => setDocuments((prev) => prev.filter((d) => d.id !== doc.id))} className="text-sm text-red-600 hover:text-red-700">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/projects')}>Cancel</Button>
          <Button type="button" variant="secondary" onClick={() => addToast('success', 'Draft saved')}>Save Draft</Button>
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting} leftIcon={<Save className="h-4 w-4" />}>Create Project</Button>
        </div>
      </form>

      <Modal isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} title="Add Team Members" size="md">
        <div className="p-5 space-y-4">
          <Input placeholder="Search users..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} autoFocus />
          <div className="max-h-80 overflow-y-auto space-y-2">
            {filteredAvailableUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => { updateField('teamMemberIds', [...form.teamMemberIds, u.id]); setUserSearch('') }}>Add</Button>
              </div>
            ))}
            {filteredAvailableUsers.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No users found.</p>}
          </div>
        </div>
      </Modal>
    </div>
  )
}
