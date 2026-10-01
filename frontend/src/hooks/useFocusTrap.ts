import { useEffect, useRef, type RefObject } from 'react'

// Guideline (Interactions — "manage focus: trap + restore", "keyboard works
// everywhere", "clear focus"): anything that renders `role="dialog"` +
// `aria-modal="true"` tells assistive tech the page behind it is inert, so Tab
// must not walk out of it, Escape must close it, and focus must come back to
// the trigger on close. This hook is the single implementation of that contract,
// extracted from Modal and ConfirmDialog so hand-rolled overlays can share it.
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Where focus lands when the overlay opens.
 * - `first`     the first focusable control (confirmation flows, menus)
 * - `container` the panel itself, so its accessible name is announced first
 */
export type InitialFocus = 'first' | 'container'

interface UseFocusTrapOptions {
  onClose?: () => void
  initialFocus?: InitialFocus
}

/**
 * Overlays nest (a Drawer holding a ConfirmDialog, a modal over a drawer), and
 * every trap listens on `document`. Without ordering, Escape closes all of them
 * at once and two Tab traps fight over the same keypress. Registration order is
 * open order, so only the most recently opened overlay reacts.
 */
const activeTraps: symbol[] = []

export function useFocusTrap(
  isActive: boolean,
  containerRef: RefObject<HTMLElement | null>,
  { onClose, initialFocus = 'first' }: UseFocusTrapOptions = {},
): void {
  // Read onClose through a ref so an inline arrow from the parent cannot
  // re-run the effect on every render — re-running would steal focus back to
  // the top of the dialog while the user is typing inside it.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isActive) return
    const container = containerRef.current
    if (!container) return

    const token = Symbol('focus-trap')
    activeTraps.push(token)
    const isTopmost = () => activeTraps[activeTraps.length - 1] === token

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))

    if (initialFocus === 'first') {
      const first = focusable()[0]
      if (first) first.focus({ preventScroll: true })
      else container.focus({ preventScroll: true })
    } else {
      // An explicit autofocus target inside the panel wins over the panel
      // itself, matching the long-standing Drawer behaviour.
      const autofocus = container.querySelector<HTMLElement>('[autofocus]')
      ;(autofocus ?? container).focus({ preventScroll: true })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost()) return
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        container.focus({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || active === container) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || active === container || !container.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const index = activeTraps.indexOf(token)
      if (index !== -1) activeTraps.splice(index, 1)
      // Return focus to whatever opened the overlay.
      if (previousActive && previousActive.isConnected) previousActive.focus({ preventScroll: true })
    }
  }, [isActive, containerRef, initialFocus])
}
