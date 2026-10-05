import { createApp } from '../src/app.js'
import { logger } from '../src/lib/logger.js'
import { ensureIndexes } from '../src/lib/collections.js'
import { validateEnv } from '../src/lib/env.js'

// Fail loudly at load rather than as a 500 on the first real request, so a
// misconfigured deployment is obvious in the build/invocation logs.
validateEnv()

const app = createApp()

/**
 * `server.ts` ensures indexes at boot, but it never runs under Vercel — this
 * adapter is the entry point. Skipping it leaves a fresh database with no
 * unique indexes at all (users.email, users.employeeId, and the timesheet
 * compound keys), and no application-layer code re-checks those constraints,
 * so duplicate rows would be accepted silently.
 *
 * Non-fatal, mirroring server.ts: a database that is briefly unreachable should
 * not stop the function serving. Memoized on globalThis so each warm instance
 * attempts this once rather than on every request.
 */
const scope = globalThis as { __emsIndexesReady?: Promise<void> }
const indexesReady = (scope.__emsIndexesReady ??= ensureIndexes().catch((err) => {
  logger.error({ err }, 'failed to ensure indexes')
}))

export default async function handler(req: any, res: any) {
  try {
    await indexesReady
    await app(req, res)
  } catch (err) {
    logger.error({ err }, 'unhandled serverless error')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
}
