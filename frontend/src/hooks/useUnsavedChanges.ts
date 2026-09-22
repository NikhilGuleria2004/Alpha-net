import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

// Guideline 5.15 (frontend_eval.md §12 item 1.2): warn before navigation when
// data could be lost. Two layers:
//
//   1. `beforeunload` — covers tab close/refresh and any full-document
//      navigation. The browser shows its own native confirmation.
//   2. `useBlocker` — covers in-app React Router navigation. The hook returns
//      the blocker; the caller renders a confirm dialog while
//      `blocker.state === 'blocked'` and resolves it via `blocker.proceed()`
//      (leave) / `blocker.reset()` (stay).
//
// NOTE: useBlocker requires a data router — App.tsx was migrated to
// createBrowserRouter for exactly this reason.
export function useUnsavedChanges(isDirty: boolean) {
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

  return useBlocker(({ currentLocation, nextLocation }) => (
    isDirty && currentLocation.pathname !== nextLocation.pathname
  ))
}
