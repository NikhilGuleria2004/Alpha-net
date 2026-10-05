/**
 * Guideline (Content — "space between the number and unit" + "use non-breaking
 * spaces to keep numbers and units together").
 *
 * Decision D-4: this is the ONLY place an hours value is turned into text, so
 * the unit style cannot drift and the number can never wrap away from its unit
 * in a table cell or KPI chip. The old `0h` special case is gone — one style
 * everywhere, including zero.
 */
export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}\u00a0h`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Compact date for dense cells: `12 Jan 26`. Day-first (en-GB) per the EMS
 * copy rules (§4.8) so dates never read US-style mid-table.
 */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  }).format(date)
}

/**
 * Weekday + compact date for day cells: `Mon 12 Jan`.
 */
export function formatDayDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

/**
 * Relative stamp for timeline rails / notification rows (`just now`, `3h
 * ago`). Falls back to the compact date beyond 7 days so old items stay
 * scannable instead of reading "412d ago".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return formatShortDate(iso)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatShortDate(iso)
}


export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  // Guideline 4.12 → interface_guide.txt:65 ("Use the ellipsis character"): use the typographic ellipsis character, not three periods.
  // Slice to maxLength - 1 so the single-glyph ellipsis keeps total length == maxLength.
  return `${text.slice(0, maxLength - 1)}…`
}
