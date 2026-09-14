/**
 * QA M17: the timesheet editor used `entry-${Date.now()}` for new entry IDs,
 * which collides when two entries are added in the same millisecond —
 * duplicate React keys and wrong row updates. `crypto.randomUUID()` is
 * collision-safe by construction and available in all modern browsers.
 */
export function createEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `entry-${crypto.randomUUID()}`
  }
  // Fallback for environments without randomUUID (very old runtimes): combine
  // the current time with a random component so collisions are vanishingly
  // unlikely even under fast repeated calls.
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}