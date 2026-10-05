import 'dotenv/config'
import { createApp } from './app.js'
import { logger } from './lib/logger.js'
import { ensureIndexes } from './lib/collections.js'
import { validateEnv } from './lib/env.js'
import { closeDb } from './lib/mongodb.js'
import { seedLeaveTypes } from './services/leave.service.js'

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

  // Seed the leave-type registry (idempotent, §7.5).
  await seedLeaveTypes()

  const app = createApp()
  const port = process.env.PORT ? Number(process.env.PORT) : 8787

  const server = app.listen(port, () => {
    logger.info({ port, env: process.env.NODE_ENV || 'development' }, 'server started')
  })

  // Graceful shutdown (§12 reliability).
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'error during shutdown')
        process.exit(1)
      }
      await closeDb()
      process.exit(0)
    })
    // Force-exit after 10s if connections don't drain.
    setTimeout(() => process.exit(0), 10_000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  logger.error({ err }, 'failed to start server')
  process.exit(1)
})
