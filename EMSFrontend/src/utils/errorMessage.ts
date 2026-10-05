/**
 * One place that turns a failed request into a toast the user can act on.
 *
 * Guideline (Copywriting — "error messages guide the exit"). Every failure toast
 * answers three questions in this order: **what failed → what the user can rely
 * on → what to do next**. "Failed to save settings" answered none of them.
 *
 * Decision D-3: the backend often names the offending field, and that detail is
 * worth keeping ("email already in use") — so a user-grade message from the API
 * is kept and appended to our framing. Everything else (the `[CODE]` prefix the
 * apiClient adds, `Internal server error`, timeouts, `Unauthorized`, raw stack
 * or JSON text) is replaced by the curated copy and written to `console.error`
 * instead, so nothing is lost without showing it to the user.
 */

export interface FailureCopy {
  /** Verb phrase naming what failed: `create that user`, `send that invoice`. */
  what: string
  /** What the user can rely on: `Nothing was saved`. */
  reassurance?: string
  /** The next action: `try again in a moment`. */
  next?: string
}

/** Response text that is plumbing, not guidance. */
const TECHNICAL_TEXT = [
  'internal server error',
  'request failed',
  'request timeout',
  'unauthorized',
  'forbidden',
  'resource not found',
  'network error',
  'load failed',
  'unexpected error',
  'failed to fetch',
]

/** apiClient error codes whose text is never user-grade. */
const TECHNICAL_CODES = ['INTERNAL_ERROR', 'UNKNOWN_ERROR', 'NETWORK_ERROR']

/** Anything that smells like a stack trace, a JSON body or a status line. */
const NOISE = /^\s*[[{]|\bstatus \d{3}\b|ECONN|ETIMEDOUT|ERR_|<\/?[a-z][\s>]|at\s+\w+\s+\(|\bundefined\b/i

/**
 * Split the apiClient's `[CODE] message` envelope.
 * Returns an empty text when the envelope is absent.
 */
function readError(error: unknown): { code: string; text: string } {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const match = /^\[([A-Z0-9_]+)\]\s*(.*)$/s.exec(raw)
  if (match) return { code: match[1], text: match[2].trim() }
  return { code: '', text: raw.trim() }
}

/** Is this text something a user could act on, rather than plumbing? */
function isUserGrade(text: string, code: string): boolean {
  if (!text) return false
  if (TECHNICAL_CODES.includes(code)) return false
  if (TECHNICAL_TEXT.includes(text.toLowerCase())) return false
  if (NOISE.test(text)) return false
  // A lone HTTP verb or status word with no sentence is not guidance.
  return /[a-z]/.test(text)
}

/** Lower-case the first word so the detail reads as a mid-sentence clause. */
function asClause(text: string): string {
  const [first, ...rest] = text.split(/\s+/)
  // Leave acronyms (API, SSO) and proper nouns alone.
  if (first.length > 1 && first === first.toUpperCase()) return text
  return first.charAt(0).toLowerCase() + first.slice(1) + (rest.length ? ` ${rest.join(' ')}` : '')
}

export function failureMessage(error: unknown, { what, reassurance, next }: FailureCopy): string {
  const { code, text } = readError(error)
  const detail = text.replace(/[.\s]+$/, '')
  const tail = [reassurance, next].filter(Boolean).join(' — ')

  if (isUserGrade(text, code)) {
    const head = `We couldn't ${what} — ${asClause(detail)}.`
    return tail ? `${head} ${tail}.` : head
  }

  // Nothing user-grade came back — keep the raw value in the console instead of
  // in the toast.
  console.error(`[failure] ${what}:`, error)
  const head = `We couldn't ${what}.`
  return tail ? `${head} ${tail}.` : head
}

/** Shorthand for a failure that needs no error object (a `catch {}` with no binding). */
export function failureText({ what, reassurance, next }: FailureCopy): string {
  const head = `We couldn't ${what}.`
  const tail = [reassurance, next].filter(Boolean).join(' — ')
  return tail ? `${head} ${tail}.` : head
}
