import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'black'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const THEME_STORAGE_KEY = 'eniac_theme'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('theme')
    if (stored === 'light' || stored === 'black') return stored
  } catch {
  }
  return 'light'
}

function themeMetaColor(theme: Theme): string {
  return theme === 'black' ? '#000000' : '#f7f8fa'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'black') {
    root.classList.add('dark')
    root.classList.add('black')
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
    }
  }, [theme])

  const setTheme = (next: Theme) => setThemeState(next)
  const toggleTheme = () => setThemeState((prev) => (prev === 'light' ? 'black' : 'light'))

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, setTheme, isDark: theme !== 'light' }}
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
