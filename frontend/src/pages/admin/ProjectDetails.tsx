import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit3, MoreHorizontal, UserPlus, Trash2, Download } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Dropdown } from '../../components/ui/Dropdown'
import { Avatar } from '../../components/ui/Avatar'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { DeadlineIndicator } from '../../components/projects/DeadlineIndicator'
import { formatDate } from '../../utils/date'
import { formatFileSize } from '../../utils/format'
import type { Activity } from '../../types/activity'
import type { Project } from '../../types/project'
import type { Timesheet } from '../../types/timesheet'
import type { User } from '../../types/auth'
import type { Document } from '../../types/document'

function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmLabel }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string; confirmLabel?: string }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel || 'Confirm'}</Button>
        </div>
      </div>
    </div>
  )
}

function DropdownItem({ children, onClick, icon, destructive }: { children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50 ${destructive ? 'text-red-600 hover:text-red-700' : 'text-slate-700'}`}>
      {icon}
      {children}
    </button>
  )
}

export function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>()
  const { projects, users, timesheets, documents, addTeamMember, removeTeamMember, deleteProject, activities } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const project = projects.find((p) => p.id === projectId)
  const projectUsers = users.filter((u) => project?.teamMemberIds.includes(u.id))
  const manager = project ? users.find((u) => u.id === project.managerId) || null : null
  const supervisor = project ? users.find((u) => u.id === project.supervisorId) || null : null
  const projectTimesheets = timesheets.filter((t) => t.projectId === projectId)
  const projectActivities = activities.filter((a) => a.projectId === projectId)
  const projectDocuments = documents.filter((d) => d.projectId === projectId)

  useEffect(() => {
    if (!project && projects.length > 0) {
      navigate('/admin/projects', { replace: true })
    }
  }, [project, projects.length, navigate])

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', content: <OverviewTab project={project} manager={manager ? { name: manager.name } : undefined} supervisor={supervisor ? { name: supervisor.name } : undefined} /> },
    { id: 'team', label: 'Team', content: <TeamTab project={project} teamMembers={projectUsers} supervisor={supervisor ? { id: supervisor.id, name: supervisor.name } : undefined} users={users} onRemove={async (userId) => { await removeTeamMember(project.id, userId); addToast('success', 'Team member removed') }} onAdd={async (userId) => { await addTeamMember(project.id, userId); addToast('success', 'Team member added') }} /> },
    { id: 'timesheets', label: 'Timesheets', content: <TimesheetsTab timesheets={projectTimesheets} users={users} /> },
    { id: 'documents', label: 'Documents', content: <DocumentsTab documents={projectDocuments} /> },
    { id: 'activity', label: 'Activity', content: <ActivityTab activities={projectActivities} users={users} /> },
  ]

  const handleDelete = async () => {
    await deleteProject(project.id)
    addToast('success', 'Project deleted successfully')
    navigate('/admin/projects')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin/projects')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">SOW: {project.sowNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(`/admin/projects/${project.id}/edit`)} leftIcon={<Edit3 className="h-4 w-4" />}>Edit Project</Button>
          <Dropdown
            trigger={
              <Button variant="secondary" rightIcon={<MoreHorizontal className="h-4 w-4" />} />
            }
          >
            <DropdownItem icon={<Trash2 className="h-4 w-4" />} destructive onClick={() => setIsDeleteOpen(true)}>Delete Project</DropdownItem>
          </Dropdown>
        </div>
      </div>

      <Tabs tabs={tabs} defaultValue="overview" />
      <ConfirmDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onConfirm={handleDelete} title="Delete Project" description={`Are you sure you want to delete "${project.name}"? This action cannot be undone.`} confirmLabel="Delete" />
    </div>
  )
}

function OverviewTab({ project, manager, supervisor }: { project: Project; manager?: { name: string } | undefined; supervisor?: { name: string } | undefined }) {
  const start = new Date(project.startDate)
  const end = new Date(project.endDate)
  const today = new Date()
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const elapsedDays = Math.max(0, Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  const progress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100))

  return (
    <div className="space-y-6">
      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Overview</h3>
        </div>
        <div className="p-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-slate-500">Start Date</p>
            <p className="mt-1 text-sm text-slate-900">{formatDate(project.startDate)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">End Date</p>
            <p className="mt-1 text-sm text-slate-900">{formatDate(project.endDate)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Deadline</p>
            <p className="mt-1 flex items-center gap-2">
              <span className="text-sm text-slate-900">{formatDate(project.deadline)}</span>
              <DeadlineIndicator deadline={project.deadline} />
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Project Manager</p>
            <p className="mt-1 text-sm text-slate-900">{manager?.name || '-'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Supervisor</p>
            <p className="mt-1 text-sm text-slate-900">{supervisor?.name || '-'}</p>
          </div>
        </div>
        {project.description && (
          <div className="border-t border-slate-200 px-5 py-4">
            <p className="text-sm font-medium text-slate-500">Description</p>
            <p className="mt-1 text-sm text-slate-700">{project.description}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Progress</h3>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Project Progress</span>
            <span className="font-medium text-slate-900">{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{elapsedDays} of {totalDays} days elapsed</p>
        </div>
      </Card>
    </div>
  )
}

function TeamTab({ project, teamMembers, supervisor, users, onRemove, onAdd }: { project: Project; teamMembers: User[]; supervisor?: { id: string; name: string } | undefined; users: User[]; onRemove: (userId: string) => void | Promise<void>; onAdd: (userId: string) => void | Promise<void> }) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [search, setSearch] = useState('')
  const availableUsers = users.filter((u) => u.status === 'active' && !project.teamMemberIds.includes(u.id))
  const filteredAvailable = availableUsers.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))

  const handleAdd = async (userId: string) => {
    await onAdd(userId)
    setIsAddOpen(false)
    setSearch('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Team Members</h3>
        <Button size="sm" variant="secondary" onClick={() => setIsAddOpen(true)} leftIcon={<UserPlus className="h-4 w-4" />}>Add Users</Button>
      </div>
      {teamMembers.length === 0 ? (
        <EmptyState title="No team members" description="Add users to this project to see them here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <Avatar name={member.name} size="md" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.department}</p>
                  {supervisor?.id === member.id && <span className="text-xs text-indigo-600">Supervisor</span>}
                </div>
              </div>
              {supervisor?.id !== member.id && (
                <button type="button" onClick={() => onRemove(member.id)} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add Team Members" size="md">
        <div className="p-5 space-y-4">
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          <div className="max-h-80 overflow-y-auto space-y-2">
            {filteredAvailable.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => handleAdd(u.id)}>Add</Button>
              </div>
            ))}
            {filteredAvailable.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No available users found.</p>}
          </div>
        </div>
      </Modal>
    </div>
  )
}

function TimesheetsTab({ timesheets: projectTimesheets, users }: { timesheets: Timesheet[]; users: User[] }) {
  const [statusFilter, setStatusFilter] = useState('')
  const filtered = projectTimesheets.filter((t) => !statusFilter || t.status === statusFilter)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48" options={[{ value: '', label: 'All Statuses' }, { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }, { value: 'withdrawn', label: 'Withdrawn' }]} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No timesheets" description="No timesheets match the selected filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Week</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Regular</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Overtime</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((t) => {
                const user = users.find((u) => u.id === t.userId)
                const start = new Date(t.weekStart)
                const end = new Date(start)
                end.setDate(end.getDate() + 4)
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700">{user?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(start)} – {formatDate(end)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">{t.regularHours.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">{t.overtimeHours.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{t.totalHours.toFixed(1)}h</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} size="sm" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function DocumentsTab({ documents: projectDocuments }: { documents: Document[] }) {
  return (
    <div className="space-y-4">
      {projectDocuments.length === 0 ? (
        <EmptyState title="No documents" description="Uploaded documents will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projectDocuments.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(doc.size)} • Uploaded {formatDate(doc.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Download document"><Download className="h-4 w-4" /></a>
                ) : (
                  <button type="button" disabled className="cursor-not-allowed rounded-lg p-2 text-slate-300" aria-label="Document unavailable"><Download className="h-4 w-4" /></button>
                )}
                <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="File type"><span className="text-xs font-medium uppercase">{doc.mimeType.split('/')[1] || doc.mimeType}</span></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActivityTab({ activities: projectActivities, users }: { activities: Activity[]; users: User[] }) {
  return (
    <div className="space-y-4">
      {projectActivities.length === 0 ? (
        <EmptyState title="No activity" description="Activity will appear here as the project progresses." />
      ) : (
        <div className="space-y-4">
          {projectActivities.map((activity) => {
            const user = users.find((u) => u.id === activity.userId)
            return (
              <div key={activity.id} className="flex gap-4">
                <Avatar name={user?.name || 'Unknown'} size="sm" />
                <div>
                  <p className="text-sm text-slate-700">{activity.description}</p>
                  <p className="text-xs text-slate-500">{user?.name} • {formatDate(activity.createdAt)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
