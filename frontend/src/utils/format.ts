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
