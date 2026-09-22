import { useEffect } from 'react'

// Guideline 4.3 (frontend_eval.md §12 item 1.3): the <title> must reflect the
// current context. AppShell derives titles from route `handle`s; pages that
// render outside the shell (auth screens) call this hook directly. Restoring
// the previous title on unmount keeps the tab label honest on transitions to
// routes without a handle.
export function usePageTitle(title?: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title} · Eniac` : 'Eniac'
    return () => {
      document.title = previous
    }
  }, [title])
}
