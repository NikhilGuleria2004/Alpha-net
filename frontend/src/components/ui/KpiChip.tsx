type KpiColor = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface KpiChipProps {
  label: string
  value: string | number
  color?: KpiColor
  className?: string
}

const colorClasses: Record<KpiColor, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  info: 'text-accent',
}

export function KpiChip({ label, value, color = 'default', className = '' }: KpiChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium ${colorClasses[color]} ${className}`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </span>
  )
}