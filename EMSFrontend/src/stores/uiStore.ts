import { create } from 'zustand'

/**
 * Cross-cutting UI state for the EMS shell (EMSFrontend.md §10).
 *
 * Deliberately tiny: server state is fetched per page (see §9), so only true
 * global UI toggles live here. `density` is persisted and mirrored onto
 * `<html data-density>` so the CSS density layer (§4.2) switches instantly.
 */

export type Density = 'comfortable' | 'compact'

/**
 * Surface style, orthogonal to the colour theme (`light | dark | black`).
 *
 *   - `soft` the original Eniac look: rounded, softly-shadowed, blue accent.
 *   - `hard` monochrome/brutalist: true greyscale, hairline borders, zero
 *            elevation, square geometry, sans body with mono accents.
 *
 * Kept on a separate axis from the theme so the two combine freely (a `hard`
 * light canvas and a `hard` OLED-black canvas are both meaningful). Mirrored
 * onto `<html data-style>` so the CSS layer switches instantly.
 */
export type SurfaceStyle = 'soft' | 'hard'

const DENSITY_STORAGE_KEY = 'eniac_ems_density'
const STYLE_STORAGE_KEY = 'eniac_ems_style'

function getInitialDensity(): Density {
  try {
    const stored = localStorage.getItem(DENSITY_STORAGE_KEY)
    if (stored === 'comfortable' || stored === 'compact') return stored
  } catch {
    // ignore storage errors
  }
  return 'comfortable'
}

function applyDensity(density: Density): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.density = density
  }
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, density)
  } catch {
    // ignore storage errors
  }
}

// Apply the persisted density before first paint of the React tree.
applyDensity(getInitialDensity())

function getInitialStyle(): SurfaceStyle {
  try {
    const stored = localStorage.getItem(STYLE_STORAGE_KEY)
    if (stored === 'soft' || stored === 'hard') return stored
  } catch {
    // ignore storage errors
  }
  return 'soft'
}

function applyStyle(style: SurfaceStyle): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.style = style
  }
  try {
    localStorage.setItem(STYLE_STORAGE_KEY, style)
  } catch {
    // ignore storage errors
  }
}

// Apply the persisted style before first paint of the React tree.
applyStyle(getInitialStyle())

interface UiState {
  density: Density
  surfaceStyle: SurfaceStyle
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  setDensity: (density: Density) => void
  toggleDensity: () => void
  setSurfaceStyle: (style: SurfaceStyle) => void
  toggleSurfaceStyle: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  density: getInitialDensity(),
  surfaceStyle: getInitialStyle(),
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  setDensity: (density) => {
    applyDensity(density)
    set({ density })
  },
  toggleDensity: () => {
    const next: Density = get().density === 'comfortable' ? 'compact' : 'comfortable'
    applyDensity(next)
    set({ density: next })
  },
  setSurfaceStyle: (surfaceStyle) => {
    applyStyle(surfaceStyle)
    set({ surfaceStyle })
  },
  toggleSurfaceStyle: () => {
    const next: SurfaceStyle = get().surfaceStyle === 'soft' ? 'hard' : 'soft'
    applyStyle(next)
    set({ surfaceStyle: next })
  },
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}))
