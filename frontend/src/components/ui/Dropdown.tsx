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
  const triggerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const focusMenuItems = () =>
    menuRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])')

  const closeAndRefocusTrigger = () => {
    setIsOpen(false)
    triggerRef.current?.querySelector<HTMLElement>('button, [href], [tabindex]')?.focus()
  }

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
    // Guideline 1.1 (checklist item 2.4): menu keyboard support — focus the
    // first item on open so Tab/arrow users land inside the menu.
    focusMenuItems()?.[0]?.focus()
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      closeAndRefocusTrigger()
      return
    }
    // Guideline 1.1 (checklist item 2.4): arrow-key navigation between items.
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const items = focusMenuItems()
      if (!items || items.length === 0) return
      event.preventDefault()
      const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLElement)
      const nextIndex =
        event.key === 'ArrowDown'
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length
      items[nextIndex].focus()
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left" onKeyDown={handleKeyDown}>
      <div
        ref={triggerRef}
        onClick={handleToggle}
        onKeyDown={(event) => {
          // Enter/Space on a non-button trigger wrapper still toggles the menu.
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            handleToggle()
          }
        }}
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {trigger}
      </div>
      {isOpen && coords && ReactDOM.createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-56 rounded-lg border border-border bg-card py-1 shadow-lg"
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
    return <div className="my-1 border-t border-border" role="separator" />
  }
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClick?.()
      }}
      onKeyDown={(event) => {
        // Tab out of the last item closes the menu instead of trapping focus.
        if (event.key === 'Tab') {
          event.currentTarget.closest('[role="menu"]')?.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
          )
        }
      }}
      className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted ${
        destructive ? 'text-destructive hover:text-destructive' : 'text-foreground'
      }`}
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      {children}
    </button>
  )
}
