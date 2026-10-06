import { useEffect, type RefObject } from 'react'
import { useBlocker } from 'react-router-dom'

// Guideline 5.15 → interface_guide.txt:93 ("Unsaved changes"): warn before navigation when
// data could be lost. Two layers:
//
//   1. `beforeunload` — covers tab close/refresh and any full-document
//      navigation. The browser shows its own native confirmation.
//   2. `useBlocker` — covers in-app React Router navigation. When the
//      predicate returns `true` the navigation pauses until the caller decides
//      (e.g. a confirm dialog). Returning `false` lets navigation proceed.
//
// NOTE: useBlocker requires a data router — App.tsx was migrated to
// createBrowserRouter for exactly this reason.
//
// `bypassRef` lets the caller flip past the guard for an *intentional*
// in-app navigation (e.g. redirect-after-create). Because it's read at call
// time on the live blocker function — not captured as a boolean in the
// closure — setting `bypassRef.current = true` makes the currently-registered
// predicate return false immediately, so the navigate is not paused even if
// the re-render that re-registers the blocker hasn't flushed yet.
export function useUnsavedChanges(isDirty: boolean, bypassRef?: RefObject<boolean>) {
  useEffect(() => {
    if (!isDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Chrome/Edge require returnValue to be set; Firefox requires
      // preventDefault. Setting both satisfies every engine.
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  return useBlocker(({ currentLocation, nextLocation }) =>
    (bypassRef ? !bypassRef.current : true) && isDirty && currentLocation.pathname !== nextLocation.pathname,
  )
}
