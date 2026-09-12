export function validateEnv() {
  const required = ['MONGODB_URI', 'MONGODB_DB_NAME', 'JWT_SECRET', 'CRON_SECRET'] as const
  const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '')
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
