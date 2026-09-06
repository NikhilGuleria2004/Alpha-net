import { type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <span className="text-sm font-bold">A</span>
            </div>
            <span className="text-lg font-semibold text-slate-900">Alphanet</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="overflow-y-auto px-2 py-4">
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
  const navigate = useNavigate()
  const location = useLocation()
  const isActive = location.pathname.startsWith(to)

  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(to)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        {icon && <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>{icon}</span>}
        {children}
      </button>
    </li>
  )
}
