import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
// @ts-ignore
import pinoHttp from 'pino-http'
import { notFoundHandler, errorHandler } from './middleware/error.js'
import { logger } from './lib/logger.js'
import { authRoutes, usersRoutes, supervisorsRoutes, projectsRoutes, timesheetsRoutes, approvalsRoutes, notificationsRoutes, activitiesRoutes, documentsRoutes, reportsRoutes } from './routes/index.js'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  app.use(cors({ origin: frontendUrl, credentials: true }))
  app.use(helmet())

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  const limiter = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use(limiter)

  const authLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  })

  app.use('/api/v1/auth', authLimiter, authRoutes())
  app.use('/api/v1/users', usersRoutes())
  app.use('/api/v1/supervisors', supervisorsRoutes())
  app.use('/api/v1/projects', projectsRoutes())
  app.use('/api/v1/timesheets', timesheetsRoutes())
  app.use('/api/v1/approvals', approvalsRoutes())
  app.use('/api/v1/notifications', notificationsRoutes())
  app.use('/api/v1/activities', activitiesRoutes())
  app.use('/api/v1/documents', documentsRoutes())
  app.use('/api/v1/reports', reportsRoutes())

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
