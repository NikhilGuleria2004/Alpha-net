import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatDate } from '../../utils/date'

export function Submissions() {
  const { user } = useAuth()
  const { timesheets, projects } = useAppData()
  const navigate = useNavigate()

  const myTimesheets = useMemo(() => {
    if (!user) return []
    return timesheets.filter((t) => t.userId === user.id && t.status !== 'draft').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [timesheets, user])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Submissions</h1>
        <p className="mt-1 text-sm text-slate-500">Track the status of your submitted timesheets.</p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          {myTimesheets.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No submissions yet" description="Your submitted timesheets will appear here." />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Week</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Project</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Regular</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Overtime</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Submitted</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {myTimesheets.map((timesheet) => {
                  const project = projects.find((p) => p.id === timesheet.projectId)
                  const start = new Date(timesheet.weekStart)
                  const end = new Date(start)
                  end.setDate(end.getDate() + 4)
                  return (
                    <tr key={timesheet.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/user/submissions/${timesheet.id}`)}>
                      <td className="px-4 py-3 text-sm text-slate-700">{formatDate(start)} – {formatDate(end)}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{project?.name || '-'}</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{timesheet.regularHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{timesheet.overtimeHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">{timesheet.totalHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{timesheet.submittedAt ? formatDate(timesheet.submittedAt) : '-'}</td>
                      <td className="px-4 py-3"><StatusBadge status={timesheet.status} size="sm" /></td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/user/submissions/${timesheet.id}`) }} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">View</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
