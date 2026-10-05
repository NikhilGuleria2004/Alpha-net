import { useUiStore, type SurfaceStyle } from '../stores/uiStore'

/**
 * Surface style access for components.
 *
 * Thin selector over the zustand `uiStore`, mirroring `useDensity`. The store
 * mirrors the value onto `<html data-style>`; the hard palette, square geometry
 * and flat elevation all live in `index.css` under that attribute, so most
 * components need no changes at all. Use `isHard` only where a component has
 * to alter markup (e.g. swapping a soft shadow for a hairline border).
 */
export function useSurfaceStyle(): {
  surfaceStyle: SurfaceStyle
  isHard: boolean
  setSurfaceStyle: (style: SurfaceStyle) => void
  toggleSurfaceStyle: () => void
} {
  const surfaceStyle = useUiStore((s) => s.surfaceStyle)
  const setSurfaceStyle = useUiStore((s) => s.setSurfaceStyle)
  const toggleSurfaceStyle = useUiStore((s) => s.toggleSurfaceStyle)
  return { surfaceStyle, isHard: surfaceStyle === 'hard', setSurfaceStyle, toggleSurfaceStyle }
}