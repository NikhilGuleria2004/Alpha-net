import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryParamState } from '../../hooks/useQueryParamState'
import { useAuth } from '../../contexts/AuthContext'
import { useAppData } from '../../contexts/AppDataContext'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Button } from '../../components/ui/Button'
import { ReviewPanel } from '../../components/approvals/ReviewPanel'
import { formatDate, formatWeekRange } from '../../utils/date'
import type { Timesheet } from '../../types/timesheet'

type TabId = 'pending' | 'approved' | 'declined' | 'withdrawn'

export function Approvals() {
  const { user } = useAuth()
  const { timesheets, users, projects } = useAppData()
  // Guideline 1.11/1.23 (checklist item 1.4): the active tab is URL state
  // (?tab=). The existing ?timesheetId= effect below already preserves other
  // params when it clears itself, so the two coexist.
  const [tab, setTab] = useQueryParamState('tab', 'pending', 'push')
  const activeTab = tab as TabId
  const setActiveTab = (id: TabId): void => setTab(id)
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // QA hygiene: Team-Timesheets "Review" used to navigate to the top of
  // Approvals with no indication of which timesheet. Read ?timesheetId= on
  // mount and auto-open the panel for that timesheet, then clear the param so
  // closing the panel returns to the list rather than reopening it.
  useEffect(() => {
    const timesheetId = searchParams.get('timesheetId')
    if (!timesheetId) return
    const timesheet = timesheets.find((t) => t.id === timesheetId)
    if (timesheet) {
      setSelectedTimesheet(timesheet)
    }
    // Clear the param regardless so the back button behaves.
    const next = new URLSearchParams(searchParams)
    next.delete('timesheetId')
    setSearchParams(next, { replace: true })
  }, [timesheets, searchParams, setSearchParams])

  const supervisedProjectIds = useMemo(() => new Set(projects.filter((p) => p.supervisorId === user?.id).map((p) => p.id)), [projects, user])
  // QA M9: the backend's getApprovals(reviewerId) returns timesheets for
  // projects the supervisor *supervises* OR *is a member of*, plus users they
  // supervise. The UI previously only matched projects.supervisorId ===
  // user.id, so items the API returned could be missing from the UI (and
  // vice-versa). Include team membership to match the API exactly.
  const memberProjectIds = useMemo(() => new Set(projects.filter((p) => p.teamMemberIds.includes(user?.id ?? '')).map((p) => p.id)), [projects, user])
  const supervisedUserIds = useMemo(() => new Set(users.filter((u) => u.supervisorId === user?.id).map((u) => u.id)), [users, user])
  const accessibleProjectIds = useMemo(() => new Set([...supervisedProjectIds, ...memberProjectIds]), [supervisedProjectIds, memberProjectIds])
  const accessibleTimesheets = useMemo(() => timesheets.filter((t) => accessibleProjectIds.has(t.projectId) || supervisedUserIds.has(t.userId)), [timesheets, accessibleProjectIds, supervisedUserIds])

  const pendingCount = accessibleTimesheets.filter((t) => t.status === 'pending').length

  const tabs: { id: TabId; label: string }[] = [
    { id: 'pending', label: `Pending (${pendingCount})` },
    { id: 'approved', label: `Approved (${accessibleTimesheets.filter((t) => t.status === 'approved').length})` },
    { id: 'declined', label: `Declined (${accessibleTimesheets.filter((t) => t.status === 'declined').length})` },
    { id: 'withdrawn', label: `Withdrawn (${accessibleTimesheets.filter((t) => t.status === 'withdrawn').length})` },
  ]

  const filteredTimesheets = accessibleTimesheets.filter((t) => t.status === activeTab)

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
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 ${
                    isActive
                      ? 'border-b-2 border-accent text-accent'
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
              <table className="min-w-full divide-y divide-border">
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
                <tbody className="divide-y divide-border">
                  {filteredTimesheets.map((timesheet) => {
                    const employee = users.find((u) => u.id === timesheet.userId)
                    const project = projects.find((p) => p.id === timesheet.projectId)
                    return (
                      <tr key={timesheet.id} className="hover:bg-muted">
                        <td className="px-4 py-3 text-sm text-foreground">{employee?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{project?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{formatWeekRange(timesheet.weekStart)}</td>
                        <td className="px-4 py-3 text-right text-sm text-foreground">{timesheet.regularHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right text-sm text-foreground">{timesheet.overtimeHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-foreground">{timesheet.totalHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{timesheet.submittedAt ? formatDate(timesheet.submittedAt) : '-'}</td>
                        <td className="px-4 py-3"><StatusBadge status={timesheet.status} size="sm" /></td>
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
