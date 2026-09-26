import { Sun, Moon, Contrast } from 'lucide-react'
import { useTheme, type Theme } from '../../contexts/ThemeContext'

interface ThemeToggleProps {
  className?: string
  size?: 'sm' | 'md'
  showLabel?: boolean
}

const THEME_META: Record<Theme, { label: string; status: string; nextLabel: string }> = {
  light: { label: 'Light theme', status: 'Light on', nextLabel: 'Switch to night theme' },
  dark: { label: 'Night theme', status: 'Night on', nextLabel: 'Switch to true dark mode' },
  black: { label: 'True dark', status: 'True dark on', nextLabel: 'Switch to light theme' },
}

// Single button cycling: light -> night (blue slate) -> true dark (pure black) -> light.
export function ThemeToggle({ className = '', size = 'md', showLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()

  const buttonSize = size === 'sm' ? 'h-8 w-8 p-1.5' : 'h-9 w-9 p-2'
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const meta = THEME_META[theme]

  if (showLabel) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ${className}`}
        aria-label={meta.nextLabel}
        title={meta.nextLabel}
      >
        <span className="flex items-center gap-2">
          {theme === 'black' ? (
            <Contrast className={`${iconSize} text-foreground`} />
          ) : theme === 'dark' ? (
            <Moon className={`${iconSize} text-muted-foreground`} />
          ) : (
            <Sun className={`${iconSize} text-amber-400`} />
          )}
          <span>{meta.label}</span>
        </span>
        <span className="text-xs text-muted-foreground">{meta.status}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${buttonSize} ${className}`}
      aria-label={`${meta.label} — ${meta.nextLabel}`}
      title={`${meta.label} — ${meta.nextLabel}`}
    >
      {theme === 'black' ? (
        <Contrast className={`${iconSize} transition-transform duration-300`} />
      ) : theme === 'dark' ? (
        <Moon className={`${iconSize} transition-transform duration-300 hover:-rotate-12`} />
      ) : (
        <Sun className={`${iconSize} text-amber-400 transition-transform duration-300 hover:rotate-45`} />
      )}
    </button>
  )
}

