import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

// Guideline 1.11/1.23 → interface_guide.txt:15 ("URL as state") + interface_guide.txt:27 ("Deep-link everything"): list control state —
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

/**
 * Text search bound to a query param, debounced.
 *
 * Guideline (Performance — "keep input responsive: debounce work that can't keep
 * up"; Interactions — "URL as state"). Typing straight into the router fires one
 * navigation per keystroke: a 12-character query re-renders the page shell and
 * re-filters the whole client-side row set 12 times, and on a mid-range phone
 * the field itself visibly lags.
 *
 * The *field* updates instantly (local state); only the URL is debounced. The
 * param is re-seeded into local state on Back/Forward, but a write this hook
 * made itself is not echoed back, so it can never clobber characters typed
 * while the debounce was still pending.
 */
export function useDebouncedQueryParam(key: string, delay = 250): [string, (value: string) => void] {
  const [param, setParam] = useQueryParamState(key)
  const [value, setValue] = useState(param)
  const lastWritten = useRef<string | null>(null)

  // Back/Forward (or any external change to the URL) resyncs the field.
  useEffect(() => {
    if (param === lastWritten.current) return
    lastWritten.current = null
    setValue(param)
  }, [param])

  useEffect(() => {
    if (value === param) return
    const timer = setTimeout(() => {
      lastWritten.current = value
      setParam(value)
    }, delay)
    return () => clearTimeout(timer)
  }, [value, param, delay, setParam])

  return [value, setValue]
}
