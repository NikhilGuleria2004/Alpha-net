import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
// @ts-ignore
import pinoHttp from 'pino-http'
import { notFoundHandler, errorHandler } from './middleware/error.js'
import { logger } from './lib/logger.js'
import { authRoutes, usersRoutes, supervisorsRoutes, projectsRoutes, timesheetsRoutes, approvalsRoutes, notificationsRoutes, activitiesRoutes, documentsRoutes, myDocumentsRoutes, reportsRoutes } from './routes/index.js'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin (e.g. server-to-server, health checks)
    if (!origin) {
      return callback(null, true)
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error(`CORS: Origin ${origin} not allowed`))
  },
  credentials: true,
}))
  app.use(helmet())

  // Must be mounted for req.cookies to work — login/refresh/logout all rely on
  // the httpOnly refreshToken cookie. Previously imported-but-never-mounted,
  // which silently broke logout session deletion (D15) and any refresh flow.
  app.use(cookieParser())

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  const isDev = process.env.NODE_ENV !== 'production'

  const limiter = rateLimit({
    windowMs: 60_000,
    max: isDev ? 1000 : 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
  app.use(limiter)

  const authLimiter = rateLimit({
    windowMs: 60_000,
    max: isDev ? 200 : 10,
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
  // Store-level document listing (QA C2): GET /api/v1/documents returns every
  // document the requester can see — the app's document store hits this on login.
  // The per-project /:projectId/documents endpoints remain nested under
  // /api/v1/projects/:projectId/documents (mounted inside projectsRoutes), so the
  // top-level mount must be myDocumentsRoutes, not documentsRoutes.
  app.use('/api/v1/documents', myDocumentsRoutes())
  app.use('/api/v1/reports', reportsRoutes())

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
