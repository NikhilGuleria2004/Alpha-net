import { type ReactNode, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Settings, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface ProfileDropdownProps {
  trigger?: ReactNode
}

export function ProfileDropdown({ trigger }: ProfileDropdownProps) {
  const { user, logout } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isLogoutOpen, setIsLogoutOpen] = useState(false)
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

  const handleLogout = async () => {
    await logout()
    addToast('success', 'Signed out successfully')
    navigate('/adminlog')
    setIsLogoutOpen(false)
    setIsOpen(false)
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted"
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        {trigger || (
          <>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
              {user?.name ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase() : 'U'}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</p>
            </div>
          </>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-border bg-card py-1 shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <p className="text-xs text-muted-foreground">{user?.role === 'admin' ? 'Administrator' : 'Employee'}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              navigate(user?.role === 'admin' ? '/admin/settings' : '/user/settings')
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            <User className="h-4 w-4" />
            Profile
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              navigate(user?.role === 'admin' ? '/admin/settings' : '/user/settings')
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
              setIsLogoutOpen(true)
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
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
          <Button variant="secondary" onClick={() => setIsLogoutOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleLogout}>Sign out</Button>
        </div>
      }
    >
      <div />
    </Modal>
    </>
  )
}
