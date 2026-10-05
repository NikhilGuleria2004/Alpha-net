import { lazy, Suspense } from 'react'

/**
 * Code-split recharts wrapper (EMSFrontend.md §12/§7.3 acceptance).
 *
 * Recharts stays out of the initial bundle — it is lazily loaded only when a
 * chart actually renders. The fallback is a fixed-height skeleton so there is
 * no layout shift (§12: CLS ≤ 0.05 — "no layout shift on load").
 */
export interface ChartPoint {
  label: string
  value: number
}

interface LazyLineChartProps {
  data: ChartPoint[]
  height?: number
  color?: string
  ariaLabel?: string
}

const LineChartImpl = lazy(() => import('./LineChartImpl'))
const BarChartImpl = lazy(() => import('./BarChartImpl'))
const DonutChartImpl = lazy(() => import('./DonutChartImpl'))

export function LazyLineChart({ data, height = 120, color = 'var(--color-accent)', ariaLabel = 'Trend chart' }: LazyLineChartProps) {
  return (
    <Suspense
      fallback={
        <div style={{ height }} className="w-full animate-pulse rounded bg-muted" role="img" aria-label={`Loading ${ariaLabel.toLowerCase()}`} />
      }
    >
      <LineChartImpl data={data} height={height} color={color} ariaLabel={ariaLabel} />
    </Suspense>
  )
}

export interface BarChartProps {
  data: ChartPoint[]
  height?: number
  color?: string
  ariaLabel?: string
}

export function LazyBarChart({ data, height = 120, color = 'var(--color-accent)', ariaLabel = 'Bar chart' }: BarChartProps) {
  return (
    <Suspense
      fallback={
        <div style={{ height }} className="w-full animate-pulse rounded bg-muted" role="img" aria-label={`Loading ${ariaLabel.toLowerCase()}`} />
      }
    >
      <BarChartImpl data={data} height={height} color={color} ariaLabel={ariaLabel} />
    </Suspense>
  )
}

export interface DonutChartProps {
  data: Array<{ label: string; value: number; color?: string }>
  height?: number
  ariaLabel?: string
  legend?: boolean
}

export function LazyDonutChart({ data, height = 140, ariaLabel = 'Distribution', legend = true }: DonutChartProps) {
  return (
    <Suspense
      fallback={
        <div style={{ height }} className="w-full animate-pulse rounded bg-muted" role="img" aria-label={`Loading ${ariaLabel.toLowerCase()}`} />
      }
    >
      <DonutChartImpl data={data} height={height} ariaLabel={ariaLabel} legend={legend} />
    </Suspense>
  )
}
