export type AttendanceStatus =
  | 'present'
  | 'remote'
  | 'late'
  | 'half_day'
  | 'on_leave'
  | 'absent'
  | 'holiday'
  | 'weekend'

const STATUS_META: Record<AttendanceStatus, { label: string; dot: string }> = {
  present: { label: 'Present', dot: 'bg-success' },
  remote: { label: 'Remote', dot: 'bg-accent' },
  late: { label: 'Late', dot: 'bg-warning' },
  half_day: { label: 'Half Day', dot: 'bg-warning/60' },
  on_leave: { label: 'On Leave', dot: 'bg-sky-500' },
  absent: { label: 'Absent', dot: 'bg-destructive' },
  holiday: { label: 'Holiday', dot: 'bg-muted-foreground/40' },
  weekend: { label: 'Weekend', dot: 'bg-border' },
}

interface AttendanceStatusDotProps {
  status: AttendanceStatus
  showLabel?: boolean
  className?: string
}

/**
 * Attendance marker. The colour is paired with a visually-hidden label (and an
 * optional visible one) so status is never conveyed by colour alone.
 */
export function AttendanceStatusDot({ status, showLabel = false, className = '' }: AttendanceStatusDotProps) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
      {showLabel ? <span className="text-xs text-foreground">{meta.label}</span> : <span className="sr-only">{meta.label}</span>}
    </span>
  )
}
