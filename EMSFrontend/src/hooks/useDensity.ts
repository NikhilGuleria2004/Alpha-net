import { useUiStore, type Density } from '../stores/uiStore'

/**
 * Density access for components (EMSFrontend.md §4.2, §10).
 *
 * Thin selector over the zustand `uiStore` so components re-render only when
 * the density value itself changes. The store mirrors the value onto
 * `<html data-density>`; components use `isCompact` to tighten paddings that
 * cannot be expressed in CSS alone.
 */
export function useDensity(): {
  density: Density
  isCompact: boolean
  setDensity: (density: Density) => void
  toggleDensity: () => void
} {
  const density = useUiStore((s) => s.density)
  const setDensity = useUiStore((s) => s.setDensity)
  const toggleDensity = useUiStore((s) => s.toggleDensity)
  return { density, isCompact: density === 'compact', setDensity, toggleDensity }
}
