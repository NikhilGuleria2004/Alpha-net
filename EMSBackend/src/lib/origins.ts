// Origins allowed to call the API cross-origin. CORS_ORIGINS is a
// comma-separated allowlist shared by the CORS middleware (app.ts) and the
// cross-origin-cookie guard (middleware/csrf.ts) — they must always agree.
let logged = false

export function getAllowedOrigins(): string[] {
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  // A mismatched allowlist is invisible from outside: the API answers 200 on
  // /health, curl works fine, and the browser reports only a generic CORS
  // failure. Logging the parsed list once per instance turns that into a line
  // that can be read directly in the deploy logs. Quote characters are called
  // out because pasting a quoted value into a Vercel env field stores the
  // quotes, producing an allowlist that can never match.
  if (!logged) {
    logged = true
    if (origins.some((origin) => /^["']|["']$/.test(origin))) {
      console.warn(
        `[cors] CORS_ORIGINS contains quote characters: ${JSON.stringify(origins)} — ` +
        'these will be part of the origin string and will never match a browser Origin header',
      )
    }
    console.log(`[cors] allowed origins (${origins.length}): ${JSON.stringify(origins)}`)
  }

  return origins
}

// Requests without an Origin header come from non-browser clients (curl,
// health checks, server-to-server) that cannot carry browser cookies, so they
// are allowed through.
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  return getAllowedOrigins().includes(origin)
}
