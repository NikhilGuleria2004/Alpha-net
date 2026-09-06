import { type ReactNode } from 'react'
import { Progress } from '../ui/Progress'
import { differenceInDays, isOverdue } from '../../utils/date'

interface DeadlineCardProps {
  projectName: string
  deadline: string
  progress?: number
  icon?: ReactNode
}

export function DeadlineCard({ projectName, deadline, progress = 0, icon }: DeadlineCardProps) {
  const deadlineDate = new Date(deadline)
  const today = new Date()
  const daysRemaining = differenceInDays(deadlineDate, today)
  const overdue = isOverdue(deadlineDate)

  let statusText: string
  let statusColor: 'success' | 'warning' | 'danger'
  let progressVariant: 'success' | 'warning' | 'danger' = 'success'

  if (overdue) {
    statusText = `Overdue by ${Math.abs(daysRemaining)} days`
    statusColor = 'danger'
    progressVariant = 'danger'
  } else if (daysRemaining <= 7) {
    statusText = `${daysRemaining} days remaining`
    statusColor = 'danger'
    progressVariant = 'danger'
  } else if (daysRemaining <= 14) {
    statusText = `${daysRemaining} days remaining`
    statusColor = 'warning'
    progressVariant = 'warning'
  } else {
    statusText = `${daysRemaining} days remaining`
    statusColor = 'success'
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{projectName}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Deadline: {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(deadlineDate)}
          </p>
        </div>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="mt-4">
        <Progress value={progress} max={100} variant={progressVariant} showValue label={statusText} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor === 'success' ? 'bg-emerald-50 text-emerald-700' : statusColor === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
          {statusColor === 'success' ? 'On Track' : statusColor === 'warning' ? 'Approaching' : 'Overdue'}
        </span>
      </div>
    </div>
  )
}
