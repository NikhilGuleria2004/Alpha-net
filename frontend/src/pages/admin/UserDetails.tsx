import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit3, FolderOpen, FolderPlus, Search, Trash2, UserPlus } from 'lucide-react'
import { useAppData } from '../../contexts/AppDataContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Dropdown } from '../../components/ui/Dropdown'
import { Avatar } from '../../components/ui/Avatar'
import { Modal } from '../../components/ui/Modal'
import { formatDate, formatWeekRange } from '../../utils/date'
import { canDeactivateUser } from '../../utils/permissions'
import type { Project } from '../../types/project'

function DropdownItem({ children, onClick, icon, destructive }: { children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; destructive?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-muted ${destructive ? 'text-destructive hover:text-destructive' : 'text-foreground'}`}>
      {icon}
      {children}
    </button>
  )
}

export function UserDetails() {
  const { userId } = useParams<{ userId: string }>()
  const { users, deactivateUser, refreshUsers, projects, timesheets, activities, addTeamMember } = useAppData()
  const { user: currentUser } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  // "Add to Project" flow: one modal, two steps — pick a branch, then (only for
  // the existing-project branch) pick the project.
  const [isAddToProjectOpen, setIsAddToProjectOpen] = useState(false)
  const [addToProjectStep, setAddToProjectStep] = useState<'choose' | 'pick'>('choose')
  const [projectSearch, setProjectSearch] = useState('')
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null)

  const user = users.find((u) => u.id === userId)

  // QA M10: pre-check the same guardrails the backend enforces so the admin
  // discovers the rule before clicking, not via a 400 toast after the fact.
  const deactivateGuard = currentUser && user
    ? canDeactivateUser(currentUser, user, users)
    : { ok: false, reason: 'Loading…' }

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

  // Projects this user can still be added to. The backend rejects archived
  // projects (POST /projects/:id/team → 400 "Cannot add members to archived
  // project") and re-adding an existing member ("User is already a team
  // member"), so the picker only offers rows that can actually succeed.
  const addableProjects = useMemo(() => {
    if (!user) return []
    return projects
      .filter((p) => p.status !== 'archived' && !p.teamMemberIds.includes(user.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [user, projects])

  const filteredAddableProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase()
    if (!query) return addableProjects
    return addableProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.client.toLowerCase().includes(query) ||
        p.sowNumber.toLowerCase().includes(query),
    )
  }, [addableProjects, projectSearch])

  const openAddToProject = () => {
    setAddToProjectStep('choose')
    setProjectSearch('')
    setIsAddToProjectOpen(true)
  }

  const closeAddToProject = () => {
    // Keep the modal open (and unclosable) while a membership request is in
    // flight so the admin can't dismiss it into a half-applied state.
    if (assigningProjectId !== null) return
    setIsAddToProjectOpen(false)
    setAddToProjectStep('choose')
    setProjectSearch('')
  }

  const handleAddToExistingProject = async (project: Project) => {
    if (!user) return
    setAssigningProjectId(project.id)
    try {
      // handleAddTeamMember (AppDataContext) updates the shared projects state on
      // success, so Assigned Projects re-renders without an extra refetch.
      const updated = await addTeamMember(project.id, user.id)
      if (updated) {
        addToast('success', `${user.name} added to ${project.name}`)
        setIsAddToProjectOpen(false)
        setAddToProjectStep('choose')
        setProjectSearch('')
      } else {
        addToast('error', `Unable to add ${user.name} to ${project.name} — please refresh and try again.`)
      }
    } catch (err: any) {
      addToast('error', err?.message || `Unable to add ${user.name} to ${project.name}.`)
    } finally {
      setAssigningProjectId(null)
    }
  }

  const goToCreateProject = () => {
    if (!user) return
    setIsAddToProjectOpen(false)
    // Hand off to the existing New Project form. ?addUserId makes that form
    // pre-select this user as a team member, so the "create new" branch also
    // completes the assignment that this button promised.
    navigate(`/admin/projects/new?addUserId=${user.id}`)
  }

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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
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
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.status === 'active' ? 'bg-success-soft text-success' : 'bg-muted text-foreground'}`}>
                  {user.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={openAddToProject}
            disabled={user.status !== 'active'}
            title={user.status !== 'active' ? 'Only active users can be added to projects' : undefined}
            leftIcon={<UserPlus className="h-4 w-4" />}
          >
            Add to Project
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/admin/users/${user.id}/edit`)} leftIcon={<Edit3 className="h-4 w-4" />}>Edit User</Button>
          <Dropdown
            trigger={
              <Button variant="secondary" rightIcon={<Edit3 className="h-4 w-4" />} />
            }
          >
            {user.status === 'active' && deactivateGuard.ok ? (
              <DropdownItem icon={<Trash2 className="h-4 w-4 text-destructive" />} destructive onClick={() => setIsConfirmOpen(true)}>Deactivate User</DropdownItem>
            ) : user.status === 'active' ? (
              <div className="px-4 py-2 text-sm text-muted-foreground" title={deactivateGuard.reason}>
                <Trash2 className="mr-2 inline h-4 w-4" />Deactivate User <span className="text-xs text-muted-foreground">— {deactivateGuard.reason}</span>
              </div>
            ) : null}
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
                <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.status === 'active' ? 'bg-success-soft text-success' : 'bg-muted text-foreground'}`}>
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
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Week</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hours</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                     <tbody className="divide-y divide-border">
{userTimesheets.map((t) => {
                          const project = projects.find((p) => p.id === t.projectId)
                          return (
                           <tr key={t.id} className="hover:bg-muted">
                             <td className="px-4 py-3 text-sm text-foreground">{formatWeekRange(t.weekStart)}</td>
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

      {/* Admin → User Details → "Add to Project". Two explicit branches: attach
          the user to an existing project, or hand off to the New Project form
          pre-seeded with this user. */}
      <Modal
        isOpen={isAddToProjectOpen}
        onClose={closeAddToProject}
        title="Add to Project"
        description={
          addToProjectStep === 'choose'
            ? `How would you like to add ${user.name} to a project?`
            : `Select the project to add ${user.name} to.`
        }
        size={addToProjectStep === 'choose' ? 'md' : 'lg'}
      >
        {addToProjectStep === 'choose' ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setAddToProjectStep('pick')}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="shrink-0 rounded-lg bg-accent-soft p-2 text-accent"><FolderOpen className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">Add to an existing project</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {addableProjects.length === 0
                    ? 'No eligible projects — this user is already on every project.'
                    : `Pick from ${addableProjects.length} project${addableProjects.length === 1 ? '' : 's'} this user is not on yet.`}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={goToCreateProject}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="shrink-0 rounded-lg bg-accent-soft p-2 text-accent"><FolderPlus className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">Create a new project</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Opens the New Project form with {user.name} pre-selected as a team member.
                </span>
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              placeholder="Search projects…"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              autoFocus
            />
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {filteredAddableProjects.map((project) => (
                <div key={project.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {project.client} • Due {formatDate(project.deadline)}
                      {project.managerId === user.id ? ' • Manager' : ''}
                      {project.supervisorId === user.id ? ' • Supervisor' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={project.status} size="sm" />
                    <Button
                      size="sm"
                      loading={assigningProjectId === project.id}
                      disabled={assigningProjectId !== null}
                      onClick={() => handleAddToExistingProject(project)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ))}
              {filteredAddableProjects.length === 0 && (
                <EmptyState
                  title="No projects available"
                  description={
                    addableProjects.length === 0
                      ? 'This user is already on every project, or there are no active projects yet.'
                      : 'No project matches your search.'
                  }
                />
              )}
            </div>
            <Button
              variant="secondary"
              onClick={() => setAddToProjectStep('choose')}
              disabled={assigningProjectId !== null}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
