import { type ReactNode, useState, useEffect, useRef, type KeyboardEvent } from 'react'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
}

export function Dropdown({ trigger, children, align = 'left' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left" onKeyDown={handleKeyDown}>
      <div onClick={() => setIsOpen((prev) => !prev)} className="cursor-pointer">
        {trigger}
      </div>
      {isOpen && (
        <div
          className={`absolute z-20 mt-2 w-56 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
          role="menu"
        >
          {children}
        </div>
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
