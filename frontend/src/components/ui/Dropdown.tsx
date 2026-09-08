import { type ReactNode, useState, useEffect, useRef, type KeyboardEvent } from 'react'
import ReactDOM from 'react-dom'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
}

export function Dropdown({ trigger, children, align = 'left' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const handleToggle = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const menuWidth = 224
      let left = align === 'right' ? rect.right - menuWidth : rect.left
      if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 8
      if (left < 8) left = 8
      setCoords({
        top: rect.bottom + 4,
        left,
      })
    }
    setIsOpen((prev) => !prev)
  }

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left" onKeyDown={handleKeyDown}>
      <div onClick={handleToggle} className="cursor-pointer">
        {trigger}
      </div>
      {isOpen && coords && ReactDOM.createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{ top: coords.top, left: coords.left }}
          role="menu"
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  )
}

interface DropdownItemProps {
  children: ReactNode
  onClick?: () => void
  icon?: ReactNode
  destructive?: boolean
  divider?: boolean
}

export function DropdownItem({ children, onClick, icon, destructive, divider }: DropdownItemProps) {
  if (divider) {
    return <div className="my-1 border-t border-slate-200" role="separator" />
  }
  return (
    <button
      role="menuitem"
      onClick={() => {
        onClick?.()
      }}
      className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-slate-50 ${
        destructive ? 'text-red-600 hover:text-red-700' : 'text-slate-700'
      }`}
    >
      {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
      {children}
    </button>
  )
}
