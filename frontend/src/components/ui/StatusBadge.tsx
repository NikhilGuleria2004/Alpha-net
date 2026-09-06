import { type ReactNode } from 'react'
import { Badge } from './Badge'
import {
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Archive,
  Activity,
} from 'lucide-react'
import type { ProjectStatus } from '../../types/project'
import type { TimesheetStatus } from '../../types/timesheet'

type Status = ProjectStatus | TimesheetStatus

interface StatusBadgeProps {
  status: Status
  size?: 'sm' | 'md'
}

const config: Record<Status, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info'; icon: ReactNode }> = {
  draft: { label: 'Draft', variant: 'default', icon: <FileText className="h-3.5 w-3.5" /> },
  pending: { label: 'Pending', variant: 'warning', icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { label: 'Approved', variant: 'success', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  declined: { label: 'Declined', variant: 'danger', icon: <XCircle className="h-3.5 w-3.5" /> },
  withdrawn: { label: 'Withdrawn', variant: 'default', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  active: { label: 'Active', variant: 'success', icon: <Activity className="h-3.5 w-3.5" /> },
  completed: { label: 'Completed', variant: 'info', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  overdue: { label: 'Overdue', variant: 'danger', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  archived: { label: 'Archived', variant: 'default', icon: <Archive className="h-3.5 w-3.5" /> },
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const { label, variant, icon } = config[status]
  return (
    <Badge variant={variant} size={size} leftIcon={icon}>
      {label}
    </Badge>
  )
}
