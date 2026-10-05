/**
 * Route `handle` shape consumed across the shell (EMSFrontend.md §5.3).
 *
 * `AppShell` reads `title` via `useMatches()` for an accurate `<title>`
 * (guide "Accurate page titles") and `breadcrumb` for the Topbar trail
 * (guide "Breadcrumbs"). Defined once so App.tsx route definitions and the
 * shell readers share a single type.
 */
export interface EmsHandle {
  title?: string
  breadcrumb?: string
}
