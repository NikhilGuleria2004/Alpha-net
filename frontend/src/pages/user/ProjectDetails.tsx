import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileDown } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate } from '../../utils/date'

export function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user } = useAuth()
  const { projects, users, timesheets, documents } = useAppData()
  const navigate = useNavigate()

  const project = projects.find((p) => p.id === projectId)
  const manager = project ? users.find((u) => u.id === project.managerId) || null : null
  const supervisor = project ? users.find((u) => u.id === project.supervisorId) || null : null
  const projectDocuments = documents.filter((d) => d.projectId === projectId)

  const myTimesheet = useMemo(() => {
    if (!user || !project) return undefined
    return timesheets.find((t) => t.userId === user.id && t.projectId === project.id)
  }, [user, project, timesheets])

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" onClick={() => navigate('/user/projects')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">{project.client}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Details</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Description</p>
                <p className="mt-1 text-sm text-slate-900">{project.description || '-'}</p>
              </div>
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
                <p className="mt-1 text-sm text-slate-900">{formatDate(project.deadline)}</p>
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
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">This Week's Timesheet</h3>
            </div>
            <div className="p-5">
              {myTimesheet ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Status</span>
                    <StatusBadge status={myTimesheet.status} size="sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Regular</span>
                    <span className="text-sm font-medium text-slate-900">{myTimesheet.regularHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Overtime</span>
                    <span className="text-sm font-medium text-slate-900">{myTimesheet.overtimeHours.toFixed(1)}h</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Total</span>
                    <span className="text-sm font-semibold text-slate-900">{myTimesheet.totalHours.toFixed(1)}h</span>
                  </div>
                  <Button className="w-full" onClick={() => navigate(`/user/timesheets/${myTimesheet.id}`)}>Open This Week's Timesheet</Button>
                </div>
              ) : (
                <EmptyState title="No timesheet yet" description="Create a timesheet to start tracking hours for this project." action={<Button onClick={() => navigate('/user/timesheets')}>Create Timesheet</Button>} />
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Documents</h3>
              <Button variant="ghost" size="sm" leftIcon={<FileDown className="h-4 w-4" />}>Export</Button>
            </div>
            <div className="p-5">
              {projectDocuments.length === 0 ? (
                <EmptyState title="No documents" description="No documents have been uploaded for this project." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {projectDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                        <p className="text-xs text-slate-500">{doc.size} • Uploaded {formatDate(doc.uploadedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
