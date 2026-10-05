import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface SparklineProps {
  data: number[]
  /** Any CSS color — defaults to the brand accent. */
  color?: string
  height?: number
  className?: string
  ariaLabel?: string
}

/**
 * Tiny axis-less trend line for KPI tiles (recharts). Presentational only, so
 * it carries a text alternative via `aria-label` (guide "accessible charts" /
 * "text alternatives for charts").
 */
export function Sparkline({ data, color = 'var(--color-accent)', height = 32, className = '', ariaLabel = 'Trend' }: SparklineProps) {
  const chartData = data.map((value, index) => ({ index, value }))

  return (
    <div className={className} style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.12}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
