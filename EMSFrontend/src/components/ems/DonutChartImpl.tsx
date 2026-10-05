import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts'
import type { DonutChartProps } from './LazyChart'

export default function DonutChartImpl({ data, height, ariaLabel, legend }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const pieData = data.map((d) => ({ ...d, fill: d.color ?? 'var(--color-accent)' }))

  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={32}
            outerRadius={56}
            paddingAngle={2}
            isAnimationActive={false}
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          {legend && <Legend layout="horizontal" verticalAlign="bottom" align="center" />}
        </PieChart>
      </ResponsiveContainer>
      <p className="sr-only">{ariaLabel}: {total} total across {pieData.length} segments.</p>
    </div>
  )
}
