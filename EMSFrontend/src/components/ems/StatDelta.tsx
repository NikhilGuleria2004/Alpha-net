import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

interface StatDeltaProps {
  value: number
  label?: string
  /** Rendered after the value, e.g. `%` or `h`. */
  unit?: string
  /** When true, a falling value is good (cost, churn) — flips the colour. */
  invert?: boolean
  className?: string
}

/** Trend indicator (▲/▼) for KPI tiles. Colour is not the only signal — the arrow carries meaning too. */
export function StatDelta({ value, label, unit = '', invert = false, className = '' }: StatDeltaProps) {
  const isFlat = value === 0
  const isGood = invert ? value < 0 : value > 0
  const tone = isFlat ? 'text-muted-foreground' : isGood ? 'text-success' : 'text-destructive'
  const Icon = isFlat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  const sign = value > 0 ? '+' : ''

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone} ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="ems-tabular">
        {sign}
        {value}
        {unit}
      </span>
      {label && <span className="font-normal text-muted-foreground">{label}</span>}
    </span>
  )
}
