import { useEffect, useRef, useState } from 'react'

/**
 * Guideline (Animations — "minimum loading-state duration: avoid flicker — delay
 * showing the indicator, then keep it visible long enough to be perceived").
 *
 * A spinner that mounts and unmounts inside one or two frames is the classic
 * "feels cheap" signal, and the global reduced-motion rule only neutralises the
 * spin, not the flash. This gate hides the indicator for the first `delay` ms of
 * loading, then shows it, and — while the component is still mounted — keeps it
 * up for at least `minDuration` after loading ends.
 *
 * `isLoading` may be `true` for a component that is itself only rendered while
 * loading (the usual `if (loading) return <LoadingState />` shape). In that case
 * the delay gate still applies and kills the flash, but the minimum-duration
 * half cannot be honoured — nothing observes the request ending — so callers
 * that *do* have a real flag should pass it.
 */
export function useDelayedLoading(isLoading: boolean, delay = 200, minDuration = 350): boolean {
  const [show, setShow] = useState(false)
  const shownAtRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!isLoading) {
      if (shownAtRef.current === null) {
        setShow(false)
        return
      }
      // Already visible: hold it for the remainder of the minimum so the user
      // actually registers the wait.
      const remaining = minDuration - (Date.now() - shownAtRef.current)
      if (remaining <= 0) {
        setShow(false)
        shownAtRef.current = null
        return
      }
      timerRef.current = setTimeout(() => {
        setShow(false)
        shownAtRef.current = null
      }, remaining)
      return
    }

    timerRef.current = setTimeout(() => {
      shownAtRef.current = Date.now()
      setShow(true)
    }, delay)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isLoading, delay, minDuration])

  return show
}