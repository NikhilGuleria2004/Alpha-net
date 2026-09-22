import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}

export function MobileNav({ isOpen, onClose, children }: MobileNavProps) {
  return (
    <div
      className={`fixed inset-0 z-50 md:hidden ${isOpen ? 'block' : 'hidden'}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <span className="text-sm font-bold">A</span>
            </div>
            <span className="text-lg font-semibold text-foreground">Eniac</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="overflow-y-auto overscroll-contain px-2 py-4">
          <ul className="space-y-1">{children}</ul>
        </nav>
      </div>
    </div>
  )
}

interface MobileNavItemProps {
  to: string
  children: ReactNode
  icon?: ReactNode
}

export function MobileNavItem({ to, children, icon }: MobileNavItemProps) {
  const location = useLocation()
  const isActive = location.pathname.startsWith(to)

  return (
    <li>
      <Link
        to={to}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? 'bg-accent-soft text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        {icon && <span className={isActive ? 'text-accent' : 'text-muted-foreground'}>{icon}</span>}
        {children}
      </Link>
    </li>
  )
}
