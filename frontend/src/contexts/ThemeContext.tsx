import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'black'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  toggleBlack: () => void
  setTheme: (theme: Theme) => void
  isDark: boolean
  isBlack: boolean
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const THEME_STORAGE_KEY = 'eniac_theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark' || stored === 'black') return stored
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    // Storage or matchMedia unavailable
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
  if (theme === 'black') {
    // True dark mode rides on top of night mode so every `dark:` utility
    // keeps working; `.black` overrides swap slate/blue tokens for pure
    // black + monochrome neutrals.
    root.classList.add('dark')
    root.classList.add('black')
    root.style.colorScheme = 'dark'
  } else if (theme === 'dark') {
    root.classList.add('dark')
    root.classList.remove('black')
    root.style.colorScheme = 'dark'
  } else {
    root.classList.remove('dark')
    root.classList.remove('black')
    root.style.colorScheme = 'light'
  }
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
      localStorage.setItem('theme', theme)
    } catch {
      // Storage quota or privacy mode error
    }
  }, [theme])

  // Listen to OS preference changes if no explicit preference is stored
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('theme')
        if (!stored) {
          setThemeState(e.matches ? 'dark' : 'light')
        }
      } catch {
        // Ignore storage errors
      }
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const setTheme = (next: Theme) => setThemeState(next)
  // Single-button cycle: light -> night (blue slate) -> true dark (pure black) -> light.
  const toggleTheme = () =>
    setThemeState((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'black' : 'light'))
  // Kept for backwards compat (previously the second navbar button).
  // Now just jumps straight to true dark, or back to light if already there.
  const toggleBlack = () => setThemeState((prev) => (prev === 'black' ? 'light' : 'black'))

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, toggleBlack, setTheme, isDark: theme !== 'light', isBlack: theme === 'black' }}
    >
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
