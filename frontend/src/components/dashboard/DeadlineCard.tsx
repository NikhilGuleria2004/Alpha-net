import { type ReactNode } from 'react'
import { differenceInDays, isOverdue } from '../../utils/date'

interface DeadlineCardProps {
  projectName: string
  deadline: string
  icon?: ReactNode
}

export function DeadlineCard({ projectName, deadline, icon }: DeadlineCardProps) {
  const deadlineDate = new Date(deadline)
  const today = new Date()
  const daysRemaining = differenceInDays(deadlineDate, today)
  const overdue = isOverdue(deadlineDate)

  let statusText: string
  let statusColor: 'success' | 'warning' | 'danger'

  if (overdue) {
    statusText = `Overdue by ${Math.abs(daysRemaining)} days`
    statusColor = 'danger'
  } else if (daysRemaining <= 7) {
    statusText = `${daysRemaining} days remaining`
    statusColor = 'danger'
  } else if (daysRemaining <= 14) {
    statusText = `${daysRemaining} days remaining`
    statusColor = 'warning'
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
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColor === 'success' ? 'bg-emerald-50 text-emerald-700' : statusColor === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
          {statusText}
        </span>
      </div>
    </div>
  )
}
