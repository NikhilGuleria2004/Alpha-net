import { type ReactNode, type ReactElement, cloneElement, isValidElement, useState, useRef, useEffect, useId } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  delay?: number
}

/**
 * Guideline (Interactions — "tooltip timing: delay the first, instant on
 * subsequent hovers"; "keyboard works everywhere"; Content — "icons have
 * labels").
 *
 * A tooltip is content on hover **or focus**, so mouse handlers alone hide it
 * from keyboard and screen-reader users entirely. This version opens on focus
 * as well, closes on Escape, and wires `aria-describedby` to the trigger so the
 * text is announced instead of only being drawn.
 */

/** Last time any tooltip was shown — a hover that follows another is instant. */
let lastShownAt = 0
const GROUP_WINDOW_MS = 700

export function Tooltip({ content, children, delay = 200 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    // First tooltip of a group waits; the rest appear immediately, so scanning a
    // toolbar of icons does not make the user wait on each one.
    const wait = Date.now() - lastShownAt < GROUP_WINDOW_MS ? 0 : delay
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      lastShownAt = Date.now()
    }, wait)
  }

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  // Escape dismisses without moving focus — otherwise the tooltip can outlive
  // the reason it appeared.
  useEffect(() => {
    if (!isVisible) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isVisible])

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  // Point the trigger at the tooltip while it is on screen. When the child is a
  // real element we can attach the attribute; otherwise the tooltip still shows
  // on hover/focus, it just cannot be announced.
  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
        'aria-describedby': isVisible ? tooltipId : undefined,
      })
    : children

  return (
    <div
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {trigger}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-foreground shadow-lg"
        >
          {content}
          <div className="absolute left-1/2 top-full -translate-x-1/2 -mt-1 border-4 border-transparent border-t-card" />
        </div>
      )}
    </div>
  )
}
