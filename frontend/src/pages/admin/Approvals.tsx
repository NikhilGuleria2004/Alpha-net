import { useState } from 'react'
import { useAppData } from '../../contexts/AppDataContext'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { ReviewPanel } from '../../components/approvals/ReviewPanel'
import { formatDate } from '../../utils/date'
import type { Timesheet } from '../../types/timesheet'

type TabId = 'pending' | 'approved' | 'declined' | 'withdrawn'

export function Approvals() {
  const { timesheets, users, projects } = useAppData()
  const [activeTab, setActiveTab] = useState<TabId>('pending')
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null)

  const pendingCount = timesheets.filter((t) => t.status === 'pending').length

  const tabs: { id: TabId; label: string }[] = [
    { id: 'pending', label: `Pending (${pendingCount})` },
    { id: 'approved', label: `Approved (${timesheets.filter((t) => t.status === 'approved').length})` },
    { id: 'declined', label: `Declined (${timesheets.filter((t) => t.status === 'declined').length})` },
    { id: 'withdrawn', label: `Withdrawn (${timesheets.filter((t) => t.status === 'withdrawn').length})` },
  ]

  const filteredTimesheets = timesheets.filter((t) => t.status === activeTab)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Timesheet Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Review and manage timesheet submissions.</p>
      </div>

      <Card>
        <div className="border-b border-border">
          <div className="flex flex-wrap items-center gap-1 px-5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isActive
                      ? 'border-b-2 border-indigo-600 text-indigo-600'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="p-5">
          {filteredTimesheets.length === 0 ? (
            <EmptyState
              title={`No ${activeTab} timesheets`}
              description={`There are no ${activeTab} timesheets to display.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Week</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Regular</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overtime</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submitted</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredTimesheets.map((timesheet) => {
                    const employee = users.find((u) => u.id === timesheet.userId)
                    const project = projects.find((p) => p.id === timesheet.projectId)
                    const start = new Date(timesheet.weekStart)
                    const end = new Date(start)
                    end.setDate(end.getDate() + 4)
                    return (
                      <tr key={timesheet.id} className="hover:bg-muted">
                        <td className="px-4 py-3 text-sm text-foreground">{employee?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{project?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(start)} – {formatDate(end)}</td>
                        <td className="px-4 py-3 text-right text-sm text-foreground">{timesheet.regularHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right text-sm text-foreground">{timesheet.overtimeHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-foreground">{timesheet.totalHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {timesheet.submittedAt ? formatDate(timesheet.submittedAt) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={timesheet.status} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedTimesheet(timesheet)}>Review</Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <ReviewPanel isOpen={Boolean(selectedTimesheet)} onClose={() => setSelectedTimesheet(null)} timesheet={selectedTimesheet!} />
    </div>
  )
}
