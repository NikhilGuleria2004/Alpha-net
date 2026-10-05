import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import type { BarChartProps } from './LazyChart'

export default function BarChartImpl({ data, height, color, ariaLabel }: BarChartProps) {
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" hide />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            formatter={(_value: unknown, _name: unknown) => ['', '']}
            labelFormatter={(label: unknown) => String(label ?? '')}
          />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
