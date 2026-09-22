import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// Guideline 1.11/1.23 (frontend_eval.md §12 item 1.4): list control state —
// search text, filters, sort, tabs — belongs in the URL so refresh, share, and
// Back/Forward all work. One hook per query param.
//
// `mode` controls history behavior:
//   - 'replace' (default) for text typing — every keystroke must not create a
//     history entry.
//   - 'push' for discrete filter/tab changes — Back/Forward then walks through
//     the filters the user applied.
//
// The setter accepts a plain value or an updater function, mirroring
// useState, so existing call sites like `setDir((prev) => …)` keep working
// (the updater receives the value currently encoded in the URL).
export function useQueryParamState(
  key: string,
  defaultValue = '',
  mode: 'push' | 'replace' = 'replace'
): [string, (value: string | ((prev: string) => string)) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(key) ?? defaultValue

  const setValue = useCallback(
    (next: string | ((prev: string) => string)) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          const current = params.get(key) ?? defaultValue
          const resolved = typeof next === 'function' ? next(current) : next
          if (resolved === defaultValue || resolved === '') {
            params.delete(key)
          } else {
            params.set(key, resolved)
          }
          return params
        },
        { replace: mode === 'replace' }
      )
    },
    [key, defaultValue, mode, setSearchParams]
  )

  return [value, setValue]
}
