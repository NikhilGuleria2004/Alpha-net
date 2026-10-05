import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * EMS theme model (EMSFrontend.md §4.1): three themes —
 *   - `light`  Eniac light canvas
 *   - `dark`   calm slate night palette (`.dark`)
 *   - `black`  true OLED dark (`.dark.black`)
 *
 * This is the EMS's intentional extension of the timesheet platform's
 * `light | black` toggle: the base CSS already ships all three palettes, so the
 * context exposes them all and cycles light → dark → black → light.
 */
export type Theme = 'light' | 'dark' | 'black'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// EMS-scoped key so the two apps never fight over one another's theme. The
// index.html bootstrap script reads the same key before hydration.
const THEME_STORAGE_KEY = 'eniac_ems_theme'

const THEME_ORDER: Theme[] = ['light', 'dark', 'black']

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark' || stored === 'black') return stored
  } catch {
    // localStorage unavailable (SSR / privacy mode) — fall through to default.
  }
  return 'light'
}

function themeMetaColor(theme: Theme): string {
  if (theme === 'black') return '#000000'
  if (theme === 'dark') return '#090d16'
  return '#f7f8fa'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const isDark = theme !== 'light'
  root.classList.toggle('dark', isDark)
  root.classList.toggle('black', theme === 'black')
  root.style.colorScheme = isDark ? 'dark' : 'light'
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', themeMetaColor(theme))
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // ignore storage errors
    }
  }, [theme])

  const setTheme = (next: Theme) => setThemeState(next)
  const toggleTheme = () =>
    setThemeState((prev) => THEME_ORDER[(THEME_ORDER.indexOf(prev) + 1) % THEME_ORDER.length])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isDark: theme !== 'light' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
