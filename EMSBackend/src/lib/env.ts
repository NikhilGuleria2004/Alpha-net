/**
 * Variables every environment must supply.
 *
 * `CORS_ORIGINS` is required in production only. Local dev has a working
 * default (http://localhost:5173), but a deployed API that silently falls back
 * to it rejects every real browser request while still answering curl and
 * health checks — so there is nothing in the logs to explain the outage. Making
 * it fatal in production turns a silent total failure into a startup error.
 */
export function validateEnv() {
  const required = ['MONGODB_URI', 'MONGODB_DB_NAME', 'JWT_SECRET'] as const
  const missing: string[] = required.filter(
    (key) => !process.env[key] || process.env[key].trim() === '',
  )

  if (process.env.NODE_ENV === 'production' && !(process.env.CORS_ORIGINS || '').trim()) {
    missing.push('CORS_ORIGINS')
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

// QA M14 (ported from sibling): the auth rate limit is a dual-axis limiter so
// a single user's brute-force attempts don't lock out a whole office behind NAT.
export function getAuthRateLimitConfig() {
  const isDev = process.env.NODE_ENV !== 'production'
  return {
    isDev,
    maxPerUser: Number(process.env.AUTH_RATE_LIMIT_PER_USER) || (isDev ? 200 : 30),
    maxPerIp: Number(process.env.AUTH_RATE_LIMIT_PER_IP) || (isDev ? 200 : 60),
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60_000,
  }
}
