import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CommandPalette, type Command } from '../ems/CommandPalette'
import { useUiStore } from '../../stores/uiStore'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useDensity } from '../../hooks/useDensity'
import { useRoleNav, namespaceForRole } from './nav'

/**
 * Cmd/Ctrl+K palette host (EMSFrontend.md §14 Phase 2 2.3).
 *
 * Owns the global keybinding and the command registry: quick-nav entries come
 * from the same role-scoped `nav.tsx` registry the sidebar uses (so the palette
 * can never offer a dead link), plus shell actions — theme cycle, density
 * toggle, notifications, settings, sign-out. Rendered once by `AppShell`.
 */
export function CommandPaletteHost() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { toggleTheme } = useTheme()
  const { toggleDensity } = useDensity()
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const navItems = useRoleNav()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(!open)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, setCommandPaletteOpen])

  const commands = useMemo<Command[]>(() => {
    const namespace = user ? namespaceForRole(user.role) : '/me'
    const navCommands: Command[] = navItems.map((item) => ({
      id: `nav-${item.to}`,
      title: item.label,
      hint: item.to,
      group: 'Go to',
      run: () => navigate(item.to),
    }))
    const actions: Command[] = [
      { id: 'action-theme', title: 'Toggle theme (light / dark / black)', group: 'Actions', run: toggleTheme },
      { id: 'action-density', title: 'Toggle density (comfortable / compact)', group: 'Actions', run: toggleDensity },
      {
        id: 'action-notifications',
        title: 'Open notifications',
        group: 'Actions',
        run: () => navigate(`${namespace}/notifications`),
      },
      { id: 'action-settings', title: 'Open settings', group: 'Actions', run: () => navigate(`${namespace}/settings`) },
      {
        id: 'action-logout',
        title: 'Sign out',
        group: 'Actions',
        run: () => {
          void logout().then(() => navigate('/login'))
        },
      },
    ]
    if (import.meta.env.DEV) {
      actions.push({
        id: 'action-playground',
        title: 'Open component playground',
        group: 'Actions',
        keywords: 'dev design system',
        run: () => navigate('/dev/components'),
      })
    }
    return [...navCommands, ...actions]
  }, [navItems, navigate, toggleTheme, toggleDensity, logout, user])

  return (
    <CommandPalette
      open={open}
      onClose={() => setCommandPaletteOpen(false)}
      commands={commands}
      placeholder="Jump to a page or run a command…"
    />
  )
}
