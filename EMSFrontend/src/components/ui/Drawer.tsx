import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

type Size = 'sm' | 'md' | 'lg'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  size?: Size
  children: ReactNode
  footer?: ReactNode
  closeLabel?: string
  resizable?: boolean
  defaultWidth?: number
}

const sizeClasses: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

const MIN_WIDTH = 320
const MAX_WIDTH = 1400
const KEYBOARD_STEP = 16

function clampWidth(value: number): number {
  return Math.min(Math.max(value, MIN_WIDTH), MAX_WIDTH)
}

export function Drawer({ isOpen, onClose, title, size = 'md', children, footer, closeLabel = 'Close', resizable = false, defaultWidth = 640 }: DrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)

  const storageKey = `drawer-width-${title ?? 'default'}`

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) setWidth(Number(saved))
  }, [storageKey])

  useEffect(() => {
    localStorage.setItem(storageKey, String(width))
  }, [width, storageKey])

  useEffect(() => {
    if (!isResizing) return
    // Pointer events (not mouse) so touch and pen drag the handle too — a
    // mouse-only drag is unusable on a tablet, which is where a resizable review
    // panel is most useful.
    const handlePointerMove = (e: PointerEvent) => {
      const newWidth = window.innerWidth - e.clientX
      setWidth(clampWidth(newWidth))
    }
    const handlePointerUp = () => setIsResizing(false)
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing])

  // Escape closes, Tab is trapped, focus enters on an autofocus control (or the
  // panel) and returns to the trigger on close. Shared with Modal and
  // ConfirmDialog so nested overlays — a Drawer holding a ConfirmDialog — only
  // react for the topmost one.
  useFocusTrap(isOpen, drawerRef, { onClose, initialFocus: 'container' })

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={title ? 'drawer-title' : undefined}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        tabIndex={-1}
        className={`relative h-screen border-l border-border bg-card shadow-xl transition-transform focus:outline-none
          ${resizable ? '' : `w-full ${sizeClasses[size]}`}`}
        style={resizable ? { width: `${width}px`, minWidth: '320px', maxWidth: '90vw' } : undefined}
      >
        {resizable && (
          // F-16 (Phase 0 decision: keep and fix). A drag-only, role-less handle
          // is invisible to keyboard and assistive tech and carries a label that
          // nothing announces. It is now a real separator with a value, and the
          // arrow keys are the keyboard equivalent of the drag.
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuenow={Math.round(width)}
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            tabIndex={0}
            onPointerDown={(e) => {
              e.preventDefault()
              setIsResizing(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                // Shift gives a fine-grained 1px nudge.
                setWidth((prev) => clampWidth(prev + (e.shiftKey ? 1 : KEYBOARD_STEP)))
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                setWidth((prev) => clampWidth(prev - (e.shiftKey ? 1 : KEYBOARD_STEP)))
              } else if (e.key === 'Home') {
                e.preventDefault()
                setWidth(MIN_WIDTH)
              } else if (e.key === 'End') {
                e.preventDefault()
                setWidth(MAX_WIDTH)
              }
            }}
            className="absolute left-0 top-0 h-full w-[3px] cursor-col-resize opacity-30 hover:opacity-60 focus:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent"
          />
        )}
        {title && (
          <div className="border-b border-border px-6 py-4">
            <h2 id="drawer-title" className="text-lg font-semibold text-foreground">
              {title}
            </h2>
          </div>
        )}
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">{children}</div>
          {footer && <div className="border-t border-border px-6 py-4">{footer}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={closeLabel}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body
  )
}
