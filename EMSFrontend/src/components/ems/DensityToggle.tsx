import { Monitor, Rows3 } from 'lucide-react'
import { useDensity } from '../../hooks/useDensity'

const DENSITY_META = {
  comfortable: { label: 'Comfortable', icon: Monitor },
  compact: { label: 'Compact', icon: Rows3 },
} as const

interface DensityToggleProps {
  className?: string
}

/**
 * Comfortable/compact switch bound to `uiStore` (EMSFrontend.md §8.2, §7.11).
 * Persists to `localStorage` and mirrors onto `<html data-density>`.
 */
export function DensityToggle({ className = '' }: DensityToggleProps) {
  const { density, toggleDensity } = useDensity()
  const next = density === 'comfortable' ? 'compact' : 'comfortable'
  const NextIcon = DENSITY_META[next].icon
  const CurrentIcon = DENSITY_META[density].icon

  return (
    <button
      type="button"
      onClick={toggleDensity}
      aria-label={`Switch to ${DENSITY_META[next].label.toLowerCase()} density (currently ${DENSITY_META[density].label.toLowerCase()})`}
      title={`Density: ${DENSITY_META[density].label} — switch to ${DENSITY_META[next].label}`}
      className={`inline-flex min-h-[32px] min-w-[32px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
    >
      <CurrentIcon className="h-4 w-4" aria-hidden="true" />
      <NextIcon className="h-3 w-3 opacity-50" aria-hidden="true" />
    </button>
  )
}
