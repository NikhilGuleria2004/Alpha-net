import 'dotenv/config'
import { createApp } from './app.js'
import { logger } from './lib/logger.js'
import { ensureIndexes } from './lib/collections.js'
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
