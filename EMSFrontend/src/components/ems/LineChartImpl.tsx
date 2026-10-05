import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import type { ChartPoint } from './LazyChart'

interface Props {
  data: ChartPoint[]
  height: number
  color: string
  ariaLabel: string
}

export default function LineChartImpl({ data, height, color, ariaLabel }: Props) {
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="label" hide />
          <YAxis hide />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            formatter={(_value: unknown, _name: unknown) => ['', '']}
            labelFormatter={(label: unknown) => String(label ?? '')}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
