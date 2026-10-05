/**
 * Escape user input so it can be safely used in a Mongo `$regex` pattern.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
