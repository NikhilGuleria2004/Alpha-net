import 'dotenv/config'
import { createApp } from './app.js'
import { logger } from './lib/logger.js'
import { ensureIndexes, ensureAssignmentIndexes, ensurePayrollIndexes } from './lib/collections.js'
import { validateEnv } from './lib/env.js'

async function main() {
  try {
    validateEnv()
  } catch (err) {
    logger.error({ err }, 'environment validation failed')
    process.exit(1)
  }

  try {
    await ensureIndexes()
  } catch (err) {
    logger.error({ err }, 'failed to ensure indexes')
  }

  // Flow Integration Phase 3: assignments indexes are additive and live in
  // their own helper so the frozen Phase 0 baseline stays valid.
  try {
    await ensureAssignmentIndexes()
  } catch (err) {
    logger.error({ err }, 'failed to ensure assignment indexes')
  }

  // Flow Integration Phase 6: payrolls indexes (new domain, unique timesheetId).
  // Kept out of ensureIndexes() so the frozen Phase 0 baseline stays valid.
  try {
    await ensurePayrollIndexes()
  } catch (err) {
    logger.error({ err }, 'failed to ensure payroll indexes')
  }

  const app = createApp()
  const port = process.env.PORT ? Number(process.env.PORT) : 3001

  app.listen(port, () => {
    logger.info({ port, env: process.env.NODE_ENV || 'development' }, 'server started')
  })
}

main().catch((err) => {
  logger.error({ err }, 'failed to start server')
  process.exit(1)
})
