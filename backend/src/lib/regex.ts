/**
 * Escape user input so it can be safely used in a Mongo `$regex` pattern.
 *
 * QA M15: `getUsers`/`getProjects` passed raw user input straight into
 * `$regex`, so metacharacters (`.*`, `(`, `)`, `[`, `]`, `{`, `}`, `^`, `$`,
 * `|`, `\`) caused Mongo errors or pathological scans. This escapes every
 * metacharacter so the input is treated as a literal substring search.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}