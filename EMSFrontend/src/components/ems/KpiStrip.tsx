import { type ReactNode } from 'react'

interface KpiStripProps {
  children: ReactNode
  className?: string
}

/**
 * Responsive band of 4–6 KPI tiles (EMSFrontend.md §4.3). Two columns on
 * mobile, up to five on desktop; the caller supplies the {@link KpiStat}s.
 */
export function KpiStrip({ children, className = '' }: KpiStripProps) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 ${className}`}>
      {children}
    </div>
  )
}
