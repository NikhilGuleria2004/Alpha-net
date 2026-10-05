/**
 * Focus the first control the app itself marked invalid.
 *
 * Guideline (Forms — "Error placement: on submit, focus the first error").
 * Every app form is the single source of truth for validation (native
 * constraint UI is switched off with `noValidate`, see F-01), so a rejected
 * submit must move the caret to the first offending field. Without this a
 * keyboard or screen-reader user on a long surface (the timesheet grid is
 * ~900 lines) gets no pointer to what failed — the error is only announced if
 * they happen to still be sitting on that field.
 *
 * Call it right after committing the error state. The lookup is deferred to the
 * next animation frame because React has not re-rendered the `aria-invalid`
 * attributes yet when the submit handler returns.
 *
 * @param scope   the form (or any container). Defaults to the form that owns
 *                the currently focused element, which is where focus sits when
 *                the user activates Submit or presses Enter.
 * @param fallback focused when the container marks nothing invalid — for
 *                surfaces that report errors as a summary list instead of
 *                per-field `aria-invalid` (see DailyEntryCard).
 */
export function focusFirstError(scope?: Element | null, fallback?: HTMLElement | null): void {
  if (typeof window === 'undefined') return

  const active = document.activeElement
  const root = scope ?? (active instanceof HTMLElement ? active.closest('form') : null)

  const focus = (element: HTMLElement) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.focus({ preventScroll: true })
    element.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  window.requestAnimationFrame(() => {
    const first = root?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (first) {
      focus(first)
    } else if (fallback && root?.contains(fallback)) {
      focus(fallback)
    }
  })
}
