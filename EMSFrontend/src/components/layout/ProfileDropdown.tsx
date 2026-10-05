import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Settings, User } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { namespaceForRole } from './nav'

/**
 * Profile menu in the Topbar (EMSFrontend.md §14 Phase 2 2.2). Profile deep
 * links to the own-record route for admin/hr (`/admin/employees/:id`) and to
 * `/me/profile` for everyone else; Settings lives in the role's namespace.
 */
export function ProfileDropdown() {
  const { user, logout } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!user) return null

  const namespace = namespaceForRole(user.role)
  const profileTo =
    user.role === 'admin' || user.role === 'hr' ? `/admin/employees/${user.id}` : '/me/profile'
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      addToast('success', 'Signed out successfully')
      navigate('/login')
      setIsLogoutOpen(false)
      setIsOpen(false)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-full p-1 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="User menu"
          aria-expanded={isOpen}
        >
          <Avatar name={user.name} size="sm" />
          <div className="hidden text-left sm:block">
            <p className="text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
        </button>
        {isOpen && (
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-border bg-card py-1 shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </div>
            <Link
              to={profileTo}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              <User className="h-4 w-4" />
              Profile
            </Link>
            <Link
              to={`${namespace}/settings`}
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setIsLogoutOpen(true)
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-error-soft"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
      <Modal
        isOpen={isLogoutOpen}
        onClose={() => setIsLogoutOpen(false)}
        title="Sign out"
        description="Are you sure you want to sign out of your account?"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsLogoutOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleLogout} loading={isLoggingOut} disabled={isLoggingOut}>
              Sign out
            </Button>
          </div>
        }
      >
        <div />
      </Modal>
    </>
  )
}
