export function validateEnv() {
  const required = ['MONGODB_URI', 'MONGODB_DB_NAME', 'JWT_SECRET', 'CRON_SECRET'] as const
  const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '')
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

// QA M14: the auth rate limit was a flat 10 req/min per IP in production, which
// locked out whole offices behind NAT. These knobs let ops tune the two
// relevant axes: how many login attempts a single user may make, and how many
// anonymous (pre-auth) attempts a single IP may make.
export function getAuthRateLimitConfig() {
  const isDev = process.env.NODE_ENV !== 'production'
  return {
    isDev,
    maxPerUser: Number(process.env.AUTH_RATE_LIMIT_PER_USER) || (isDev ? 200 : 30),
    maxPerIp: Number(process.env.AUTH_RATE_LIMIT_PER_IP) || (isDev ? 200 : 60),
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60_000,
  }
}
