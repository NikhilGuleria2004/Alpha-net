import { type ReactNode } from 'react'
import { Activity } from 'lucide-react'

interface ActivityTimelineProps {
  items: Array<{
    id: string
    description: string
    timestamp: string
    userName?: string
    icon?: ReactNode
    color?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  }>
}

const colorClasses: Record<string, string> = {
  default: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-indigo-50 text-indigo-600',
}

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${colorClasses[item.color || 'default']}`}>
              {item.icon || <Activity className="h-5 w-5" />}
            </div>
            {index !== items.length - 1 && <div className="mt-2 h-full w-px bg-slate-200" />}
          </div>
          <div className="flex-1 pb-4">
            <p className="text-sm text-slate-700">{item.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              {item.userName ? `${item.userName} • ` : ''}
              {formatTimeAgo(item.timestamp)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date()
  const date = new Date(timestamp)
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined }).format(date)
}
