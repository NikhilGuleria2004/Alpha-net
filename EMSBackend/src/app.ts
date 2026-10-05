import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { randomUUID } from 'node:crypto'
import pinoHttp from 'pino-http'
import { notFoundHandler, errorHandler } from './middleware/error.js'
import { logger } from './lib/logger.js'
import { getAllowedOrigins } from './lib/origins.js'
import { getAuthRateLimitConfig } from './lib/env.js'
import { getRateLimitStore } from './lib/rateLimitStore.js'
import { authRoutes } from './routes/auth.js'
import { attendanceRoutes } from './routes/attendance.js'
import { createDashboardRouter } from './routes/dashboard.js'
import { rolesRoutes } from './routes/roles.js'
import { onboardingRoutes } from './routes/onboarding.js'
import { peopleRoutes } from './routes/people.js'
import { departmentsRoutes } from './routes/departments.js'
import { payrateRoutes } from './routes/payrate.js'
import { leaveRoutes } from './routes/leave.js'
import { documentsRoutes } from './routes/documents.js'
import { clientsRoutes } from './routes/clients.js'
import { projectsRoutes } from './routes/projects.js'
import { assignmentsRoutes } from './routes/assignments.js'
import { payrollRoutes } from './routes/payroll.js'
import { reportsRoutes } from './routes/reports.js'
import { notificationsRoutes } from './routes/notifications.js'
import { settingsRoutes } from './routes/settings.js'
import { auditRoutes } from './routes/audit.js'


export function createApp() {
  const app = express()

  app.set('trust proxy', 1)

  // --- Middleware stack (ported from sibling, §8 ordering) -------------------
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true)
      }
      if (getAllowedOrigins().includes(origin)) {
        return callback(null, true)
      }
      return callback(null, false)
    },
    credentials: true,
  }))
  // helmet() defaults to cross-origin-resource-policy: same-origin, which is a
  // sensible default for a page but wrong for an API consumed by a different
  // origin — the SPA is served from the marketing domain while this runs on
  // *.vercel.app. `cross-origin` keeps the header meaningful (no leaking
  // resources to arbitrary sites via <img>/<script>) while letting the SPA read
  // API responses. Everything else stays at helmet's defaults.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

  app.use(cookieParser())

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  app.use(pinoHttp({
    logger,
    genReqId: () => randomUUID(),
    customSuccessMessage: (_req: unknown, _res: unknown, responseTime: number) => `Completed ${responseTime}ms`,
    customLogLevel: (_res: unknown, err: unknown) => {
      if (err) return 'error'
      return 'info'
    },
  }))

  const isDev = process.env.NODE_ENV !== 'production'

  const limiter = rateLimit({
    windowMs: 60_000,
    max: isDev ? 1000 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    store: getRateLimitStore('ems:rl:global:'),
  })
  app.use(limiter)

  // Dual-axis auth rate limiter (§8, QA M14): per-user (email) + per-IP.
  // Mounted on /auth/* only. The cookie-trusted endpoints (refresh, logout,
  // redeem-invite) also get the CSRF Origin guard via requireTrustedCookieSource.
  const authConfig = getAuthRateLimitConfig()
  const authUserLimiter = rateLimit({
    windowMs: authConfig.windowMs,
    max: authConfig.maxPerUser,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: express.Request) => {
      const body = (req.body && typeof req.body === 'object') ? req.body : {}
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      return email || req.ip || 'unknown'
    },
    store: getRateLimitStore('ems:rl:auth-user:'),
  })
  const authIpLimiter = rateLimit({
    windowMs: authConfig.windowMs,
    max: authConfig.maxPerIp,
    standardHeaders: true,
    legacyHeaders: false,
    store: getRateLimitStore('ems:rl:auth-ip:'),
  })

    app.use('/api/v1/auth', authUserLimiter, authIpLimiter, authRoutes())
   app.use('/api/v1/attendance', attendanceRoutes())
   app.use('/api/v1/dashboard', createDashboardRouter())
   app.use('/api/v1/onboarding', onboardingRoutes())
   app.use('/api/v1/employees', peopleRoutes())
    app.use('/api/v1/departments', departmentsRoutes())
  app.use('/api/v1/payrate', payrateRoutes())
  app.use('/api/v1/leave', leaveRoutes())
  app.use('/api/v1/documents', documentsRoutes())
  app.use('/api/v1/clients', clientsRoutes())
  app.use('/api/v1/projects', projectsRoutes())
  app.use('/api/v1/assignments', assignmentsRoutes())
  app.use('/api/v1/payroll', payrollRoutes())
  app.use('/api/v1/reports', reportsRoutes())
  app.use('/api/v1/notifications', notificationsRoutes())
  app.use('/api/v1/settings', settingsRoutes())
  app.use('/api/v1/audit', auditRoutes())
  app.use('/api/v1/roles', rolesRoutes())

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
