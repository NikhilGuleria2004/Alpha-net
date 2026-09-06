import { differenceInDays, isOverdue } from '../../utils/date'

type DeadlineStatus = 'normal' | 'warning' | 'overdue'

interface DeadlineIndicatorProps {
  deadline: string
}

export function DeadlineIndicator({ deadline }: DeadlineIndicatorProps) {
  const deadlineDate = new Date(deadline)
  const today = new Date()
  const daysRemaining = differenceInDays(deadlineDate, today)
  const overdue = isOverdue(deadlineDate)

  let status: DeadlineStatus
  let label: string
  let detail: string

  if (overdue) {
    status = 'overdue'
    label = 'Overdue'
    detail = `${Math.abs(daysRemaining)} days past deadline`
  } else if (daysRemaining <= 7) {
    status = 'warning'
    label = 'Deadline approaching'
    detail = `${daysRemaining} days remaining`
  } else {
    status = 'normal'
    label = 'On Track'
    detail = `${daysRemaining} days remaining`
  }

  const colorClasses = {
    normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    overdue: 'bg-red-50 text-red-700 border-red-200',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${colorClasses[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}: {detail}
    </span>
  )
}
