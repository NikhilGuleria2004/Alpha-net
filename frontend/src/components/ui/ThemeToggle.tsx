import { Sun, Contrast } from 'lucide-react'
import { useTheme, type Theme } from '../../contexts/ThemeContext'

interface ThemeToggleProps {
  className?: string
  size?: 'sm' | 'md'
  showLabel?: boolean
}

const THEME_META: Record<Theme, { label: string; icon: 'sun' | 'contrast' }> = {
  light: { label: 'Light theme', icon: 'sun' },
  black: { label: 'Dark theme', icon: 'contrast' },
}

export function ThemeToggle({ className = '', size = 'md', showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()

  const buttonSize = size === 'sm' ? 'h-8 w-8 p-1.5' : 'h-9 w-9 p-2'
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const nextTheme: Theme = theme === 'light' ? 'black' : 'light'
  const nextLabel = `Switch to ${THEME_META[nextTheme].label}`

  if (showLabel) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${className}`}
        aria-label={nextLabel}
        title={nextLabel}
      >
        <span className="flex items-center gap-2">
          {THEME_META[theme].icon === 'sun' ? (
            <Sun className={`${iconSize} text-amber-400`} />
          ) : (
            <Contrast className={`${iconSize} text-foreground`} />
          )}
          <span>{THEME_META[theme].label}</span>
        </span>
        <span className="text-xs text-muted-foreground capitalize">{nextTheme} on</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${buttonSize} ${className}`}
      aria-label={`${THEME_META[theme].label} — ${nextLabel}`}
      title={`${THEME_META[theme].label} — ${nextLabel}`}
    >
      {THEME_META[theme].icon === 'sun' ? (
        <Sun className={`${iconSize} text-amber-400 transition-transform duration-200 hover:rotate-45`} />
      ) : (
        <Contrast className={`${iconSize} transition-transform duration-200`} />
      )}
    </button>
  )
}
