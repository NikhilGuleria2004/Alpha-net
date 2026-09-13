import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit3, Trash2 } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Dropdown } from '../../components/ui/Dropdown'
import { Avatar } from '../../components/ui/Avatar'
import { Modal } from '../../components/ui/Modal'
import { formatDate } from '../../utils/date'

function DropdownItem({ children, onClick, icon, destructive }: { children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted ${destructive ? 'text-red-600 hover:text-red-700' : 'text-foreground'}`}>
      {icon}
      {children}
    </button>
  )
}

export function UserDetails() {
  const { userId } = useParams<{ userId: string }>()
  const { users, deactivateUser, refreshUsers, projects, timesheets, activities } = useAppData()
  const { user: currentUser } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const user = users.find((u) => u.id === userId)

  const assignedProjects = useMemo(() => {
    if (!user) return []
    return projects.filter((p) => p.teamMemberIds.includes(user.id) || p.managerId === user.id || p.supervisorId === user.id)
  }, [user, projects])

  const userTimesheets = useMemo(() => {
    if (!user) return []
    return timesheets.filter((t) => t.userId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  }, [user, timesheets])

  const userActivities = useMemo(() => {
    if (!user) return []
    return activities.filter((a) => a.userId === user.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  }, [user, activities])

  const handleDeactivate = async () => {
    if (!user) return
    setIsProcessing(true)
    try {
      const updated = await deactivateUser(user.id)
      if (updated) {
        addToast('success', 'User deactivated successfully')
        await refreshUsers()
        if (currentUser?.id === user.id) {
          navigate('/login')
        }
      } else {
        addToast('error', 'Unable to deactivate user — please refresh and try again.')
      }
    } catch (err: any) {
      const message =
        err?.message ||
        'Unable to deactivate user. You cannot deactivate yourself or the last active admin.'
      addToast('error', message)
    } finally {
      setIsProcessing(false)
      setIsConfirmOpen(false)
    }
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin/users')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground">{user.name}</h1>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-foreground'}`}>
                  {user.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(`/admin/users/${user.id}/edit`)} leftIcon={<Edit3 className="h-4 w-4" />}>Edit User</Button>
          <Dropdown
            trigger={
              <Button variant="secondary" rightIcon={<Edit3 className="h-4 w-4" />} />
            }
          >
            {user.status === 'active' && (
              <DropdownItem icon={<Trash2 className="h-4 w-4 text-red-500" />} destructive onClick={() => setIsConfirmOpen(true)}>Deactivate User</DropdownItem>
            )}
          </Dropdown>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold text-foreground">Profile</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Employee ID</p>
                <p className="mt-1 text-sm text-foreground">{user.employeeId}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-foreground'}`}>
                  {user.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Department</p>
                <p className="mt-1 text-sm text-foreground">{user.department}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Role</p>
                <p className="mt-1 text-sm text-foreground">{user.role === 'admin' ? 'Administrator' : 'User'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Supervisor</p>
                <p className="mt-1 text-sm text-foreground">{user.isSupervisor ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold text-foreground">Assigned Projects ({assignedProjects.length})</h3>
            </div>
            <div className="p-5">
              {assignedProjects.length === 0 ? (
                <EmptyState title="No projects assigned" description="This user is not assigned to any projects." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {assignedProjects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:bg-muted">
                      <div>
                        <p className="text-sm font-medium text-foreground">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.client} • Due {formatDate(project.deadline)}</p>
                      </div>
                      <StatusBadge status={project.status} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold text-foreground">Recent Submissions</h3>
            </div>
            <div className="p-5">
              {userTimesheets.length === 0 ? (
                <EmptyState title="No submissions yet" description="This user has not submitted any timesheets." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Week</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hours</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                     <tbody className="divide-y divide-slate-200">
                       {userTimesheets.map((t) => {
                         const project = projects.find((p) => p.id === t.projectId)
                         const start = new Date(t.weekStart)
                         const end = new Date(start)
                         end.setDate(end.getDate() + 4)
                         return (
                          <tr key={t.id} className="hover:bg-muted">
                            <td className="px-4 py-3 text-sm text-foreground">{formatDate(start)} – {formatDate(end)}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{project?.name || '-'}</td>
                            <td className="px-4 py-3 text-right text-sm text-foreground">{t.totalHours.toFixed(1)}h</td>
                            <td className="px-4 py-3"><StatusBadge status={t.status} size="sm" /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
            </div>
            <div className="p-5">
              {userActivities.length === 0 ? (
                <EmptyState title="No activity" description="This user has no recent activity." />
              ) : (
                <div className="space-y-4">
                  {userActivities.map((activity) => (
                    <div key={activity.id} className="flex gap-4">
                      <Avatar name={users.find((u) => u.id === activity.userId)?.name || 'Unknown'} size="sm" />
                      <div>
                        <p className="text-sm text-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(activity.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Deactivate User"
        description={
          user
            ? `Are you sure you want to deactivate ${user.name}? They will lose access immediately. This action can be undone from the user list.`
            : 'Are you sure you want to deactivate this user?'
        }
        size="sm"
        closeLabel="Cancel"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsConfirmOpen(false)} disabled={isProcessing}>Cancel</Button>
            <Button variant="danger" onClick={handleDeactivate} disabled={isProcessing}>
              {isProcessing ? 'Deactivating…' : 'Deactivate'}
            </Button>
          </>
        }
      />
    </div>
  )
}
