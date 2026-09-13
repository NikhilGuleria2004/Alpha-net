import { createApp } from '../src/app.js'
import { logger } from '../src/lib/logger.js'

const app = createApp()

export default async function handler(req: any, res: any) {
  try {
    await app(req, res)
  } catch (err) {
    logger.error({ err }, 'unhandled serverless error')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
  }
}
