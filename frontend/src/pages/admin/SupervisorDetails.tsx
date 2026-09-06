import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit3, Trash2 } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Dropdown } from '../../components/ui/Dropdown'
import { Avatar } from '../../components/ui/Avatar'
import { formatDate } from '../../utils/date'
import type { User } from '../../types/auth'
import type { Timesheet } from '../../types/timesheet'
import type { Activity } from '../../types/activity'
import type { Project } from '../../types/project'

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

export function SupervisorDetails() {
  const { userId } = useParams<{ userId: string }>()
  const { users, deactivateUser, refreshUsers, projects, timesheets, activities } = useAppData()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const user = users.find((u) => u.id === userId)

  const assignedProjects = useMemo(() => {
    if (!user) return []
    return projects.filter((p) => p.supervisorId === user.id)
  }, [user, projects])

  const teamMembers = useMemo(() => {
    if (!user) return []
    return users.filter((u) => u.supervisorId === user.id)
  }, [user, users])

  const pendingReviews = useMemo(() => {
    if (!user) return []
    const supervisedProjectIds = assignedProjects.map((p) => p.id)
    return timesheets.filter((t) => t.status === 'pending' && supervisedProjectIds.includes(t.projectId))
  }, [user, assignedProjects, timesheets])

  const userActivities = useMemo(() => {
    if (!user) return []
    return activities.filter((a) => a.userId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  }, [user, activities])

  const handleDeactivate = async () => {
    if (!user) return
    await deactivateUser(user.id)
    addToast('success', 'Supervisor deactivated successfully')
    refreshUsers()
    navigate('/admin/supervisors')
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', content: <OverviewTab user={user} assignedProjects={assignedProjects} teamMembers={teamMembers} pendingReviews={pendingReviews} /> },
    { id: 'team', label: `Team Members (${teamMembers.length})`, content: <TeamTab teamMembers={teamMembers} /> },
    { id: 'reviews', label: `Pending Reviews (${pendingReviews.length})`, content: <ReviewsTab pendingReviews={pendingReviews} users={users} projects={projects} /> },
    { id: 'activity', label: 'Activity', content: <ActivityTab userActivities={userActivities} users={users} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin/supervisors')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-900">{user.name}</h1>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                  {user.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{user.email}</p>
              <p className="text-xs text-slate-500">{user.department}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(`/admin/users/${user.id}/edit`)} leftIcon={<Edit3 className="h-4 w-4" />}>Edit</Button>
          <Dropdown
            trigger={
              <Button variant="secondary" rightIcon={<Edit3 className="h-4 w-4" />} />
            }
          >
            <DropdownItem icon={<Trash2 className="h-4 w-4" />} destructive onClick={() => setIsDeleteOpen(true)}>Deactivate</DropdownItem>
          </Dropdown>
        </div>
      </div>

      <Tabs tabs={tabs} defaultValue="overview" />
      <ConfirmDialog isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} onConfirm={handleDeactivate} title="Deactivate Supervisor" description={`Are you sure you want to deactivate "${user.name}"? This action cannot be undone.`} confirmLabel="Deactivate" />
    </div>
  )
}

function OverviewTab({ user, assignedProjects, teamMembers, pendingReviews }: { user: User; assignedProjects: Project[]; teamMembers: User[]; pendingReviews: Timesheet[] }) {
  return (
    <div className="space-y-6">
      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Supervisor Profile</h3>
        </div>
        <div className="p-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-slate-500">Employee ID</p>
            <p className="mt-1 text-sm text-slate-900">{user.employeeId}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Department</p>
            <p className="mt-1 text-sm text-slate-900">{user.department}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Status</p>
            <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              {user.status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Assigned Projects</p>
            <p className="mt-1 text-sm text-slate-900">{assignedProjects.length}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Team Members</p>
            <p className="mt-1 text-sm text-slate-900">{teamMembers.length}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Pending Reviews</p>
            <p className="mt-1 text-sm text-slate-900">{pendingReviews.length}</p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Assigned Projects</h3>
        </div>
        <div className="p-5">
          {assignedProjects.length === 0 ? (
            <EmptyState title="No projects assigned" description="This supervisor is not assigned to any projects." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {assignedProjects.map((project) => (
                <div key={project.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{project.name}</p>
                    <p className="text-xs text-slate-500">{project.client} • Due {formatDate(project.deadline)}</p>
                  </div>
                  <StatusBadge status={project.status} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function TeamTab({ teamMembers }: { teamMembers: User[] }) {
  return (
    <div className="space-y-4">
      {teamMembers.length === 0 ? (
        <EmptyState title="No team members" description="This supervisor has no team members assigned." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <Avatar name={member.name} size="md" />
              <div>
                <p className="text-sm font-medium text-slate-900">{member.name}</p>
                <p className="text-xs text-slate-500">{member.department}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewsTab({ pendingReviews, users, projects }: { pendingReviews: Timesheet[]; users: User[]; projects: Project[] }) {
  return (
    <div className="space-y-4">
      {pendingReviews.length === 0 ? (
        <EmptyState title="No pending reviews" description="All timesheets for this supervisor's projects have been reviewed." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Project</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Week</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pendingReviews.map((t) => {
                const user = users.find((u) => u.id === t.userId)
                const project = projects.find((p) => p.id === t.projectId)
                const start = new Date(t.weekStart)
                const end = new Date(start)
                end.setDate(end.getDate() + 4)
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700">{user?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{project?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatDate(start)} – {formatDate(end)}</td>
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

function ActivityTab({ userActivities, users }: { userActivities: Activity[]; users: User[] }) {
  return (
    <div className="space-y-4">
      {userActivities.length === 0 ? (
        <EmptyState title="No activity" description="This user has no recent activity." />
      ) : (
        <div className="space-y-4">
          {userActivities.map((activity) => (
            <div key={activity.id} className="flex gap-4">
              <Avatar name={users.find((u) => u.id === activity.userId)?.name || 'Unknown'} size="sm" />
              <div>
                <p className="text-sm text-slate-700">{activity.description}</p>
                <p className="text-xs text-slate-500">{formatDate(activity.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
