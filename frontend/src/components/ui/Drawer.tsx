import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type Size = 'sm' | 'md' | 'lg'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  size?: Size
  children: ReactNode
  footer?: ReactNode
  closeLabel?: string
}

const sizeClasses: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

export function Drawer({ isOpen, onClose, title, size = 'md', children, footer, closeLabel = 'Close' }: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Tab') {
        const drawer = drawerRef.current
        if (!drawer) return
        const focusable = drawer.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={title ? 'drawer-title' : undefined}>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        className={`relative h-full w-full ${sizeClasses[size]} bg-card shadow-xl transition-transform`}
      >
        {title && (
          <div className="border-b border-border px-6 py-4">
            <h2 id="drawer-title" className="text-lg font-semibold text-foreground">
              {title}
            </h2>
          </div>
        )}
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && <div className="border-t border-border px-6 py-4">{footer}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label={closeLabel}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body
  )
}
