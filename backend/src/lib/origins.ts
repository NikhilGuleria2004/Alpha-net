// Origins allowed to call the API cross-origin. FRONTEND_URL is a
// comma-separated allowlist shared by the CORS middleware (app.ts) and the
// cross-origin-cookie guard (middleware/csrf.ts) — they must always agree.
export function getAllowedOrigins(): string[] {
  return (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

// Requests without an Origin header come from non-browser clients (curl,
// health checks, server-to-server) that cannot carry browser cookies, so they
// are allowed through.
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  return getAllowedOrigins().includes(origin)
}