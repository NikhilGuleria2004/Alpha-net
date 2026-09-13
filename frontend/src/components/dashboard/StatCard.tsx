import { type ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card } from '../ui/Card'

interface StatCardProps {
  title: string
  value: string | number
  icon?: ReactNode
  trend?: { value: number; label: string }
  supportingText?: string
  iconBgColor?: string
  onClick?: () => void
}

export function StatCard({ title, value, icon, trend, supportingText, iconBgColor = 'bg-indigo-50 text-indigo-600', onClick }: StatCardProps) {
  const isPositive = trend && trend.value > 0
  return (
    <Card hoverable={Boolean(onClick)} onClick={onClick} className="transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between p-5">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
          {trend && (
            <div className="mt-2 flex items-center gap-1 text-sm">
              <span className={`flex items-center gap-0.5 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {Math.abs(trend.value)}
              </span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}
          {supportingText && <p className="mt-1 text-sm text-muted-foreground">{supportingText}</p>}
        </div>
        {icon && (
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconBgColor}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}
