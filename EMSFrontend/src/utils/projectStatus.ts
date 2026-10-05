import type { ProjectStatus } from '../types/project'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Planning',
  active: 'Active',
  completed: 'Completed',
  overdue: 'Overdue',
  archived: 'Archived',
}

export const PROJECT_STATUS_VARIANTS: Record<ProjectStatus, BadgeVariant> = {
  draft: 'info',
  active: 'success',
  completed: 'default',
  overdue: 'warning',
  archived: 'default',
}
