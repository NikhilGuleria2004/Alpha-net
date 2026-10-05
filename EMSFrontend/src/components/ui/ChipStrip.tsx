import { type ReactNode } from 'react'

interface ChipStripProps {
  children: ReactNode
  className?: string
}

export function ChipStrip({ children, className = '' }: ChipStripProps) {
  return <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>{children}</div>
}