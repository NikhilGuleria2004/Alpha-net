import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { formatDate } from '../../utils/date'
import { useAppData } from '../../contexts/AppDataContext'

export function SubmissionDetails() {
  const { submissionId } = useParams<{ submissionId: string }>()
  const { users, projects, timesheets } = useAppData()
  const navigate = useNavigate()

  const timesheet = timesheets.find((t) => t.id === submissionId)
  const project = timesheet ? projects.find((p) => p.id === timesheet.projectId) : null
  const review = timesheet?.review
  const reviewer = review ? users.find((u) => u.id === review.reviewedBy) : null

  const timeline = useMemo(() => {
    if (!timesheet) return []
    const events: { date: string; label: string; description: string }[] = []
    events.push({ date: timesheet.createdAt, label: 'Created', description: 'Timesheet created' })
    if (timesheet.submittedAt) {
      events.push({ date: timesheet.submittedAt, label: 'Submitted', description: 'Timesheet submitted for review' })
    }
    if (timesheet.review) {
      const label = timesheet.status === 'approved' ? 'Approved' : timesheet.status === 'declined' ? 'Declined' : 'Reviewed'
      events.push({ date: timesheet.review.reviewedAt, label, description: timesheet.review.reason || `Timesheet ${label.toLowerCase()}` })
    }
    if (timesheet.status === 'withdrawn') {
      events.push({ date: timesheet.updatedAt, label: 'Withdrawn', description: 'Timesheet was withdrawn' })
    }
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [timesheet])

  if (!timesheet) {
    return (
      <div className="flex items-center justify-center py-20">
        <EmptyState title="Not found" description="This submission does not exist." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" onClick={() => navigate('/user/submissions')} leftIcon={<ArrowLeft className="h-4 w-4" />} />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Submission Details</h1>
          <p className="mt-1 text-sm text-slate-500">{project?.name}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Overview</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Status</p>
                <StatusBadge status={timesheet.status} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Submitted</p>
                <p className="mt-1 text-sm text-slate-900">{timesheet.submittedAt ? formatDate(timesheet.submittedAt) : '-'}</p>
              </div>
              {reviewer && timesheet.review && (
                <div>
                  <p className="text-sm font-medium text-slate-500">Reviewer</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Avatar name={reviewer.name} size="sm" />
                    <span className="text-sm text-slate-900">{reviewer.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{timesheet.review?.reviewedAt ? formatDate(timesheet.review.reviewedAt) : ''}</p>
                </div>
              )}
              {timesheet.status === 'declined' && timesheet.review?.reason && (
                <div>
                  <p className="text-sm font-medium text-slate-500">Decline Reason</p>
                  <p className="mt-1 text-sm text-slate-700">{timesheet.review.reason}</p>
                </div>
              )}
              {timesheet.status === 'withdrawn' && timesheet.review?.reason && (
                <div>
                  <p className="text-sm font-medium text-slate-500">Withdrawal Reason</p>
                  <p className="mt-1 text-sm text-slate-700">{timesheet.review.reason}</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Timeline</h3>
            </div>
            <div className="p-5">
              <div className="space-y-4">
                {timeline.map((event, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                      {index < timeline.length - 1 && <div className="h-full w-px bg-slate-200" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{event.label}</p>
                      <p className="text-xs text-slate-500">{event.description}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(event.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
