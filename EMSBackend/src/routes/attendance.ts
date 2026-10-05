import { Router, type Response, type NextFunction } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireCapability } from '../middleware/access.js'
import { validateBody } from '../middleware/validate.js'
import { markAttendanceSchema, type MarkAttendanceInput } from '../schemas/attendance.schema.js'
import * as attendanceService from '../services/attendance.service.js'
import { logger } from '../lib/logger.js'

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Admin is exempt from marking attendance (§6.2, App. B). Returns
 * 403 ATTENDANCE_EXEMPT instead of the generic 403 FORBIDDEN.
 */
function noAdminMark(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  if (req.user?.role === 'admin') {
    return _res.status(403).json({
      error: { code: 'ATTENDANCE_EXEMPT', message: 'Administrators are exempt from marking attendance.' },
    })
  }
  next()
}

export function attendanceRoutes() {
  const router = Router()

  // --- Self-service (employee + supervisor + manager + hr) ---------------------

  /** POST /attendance/mark — mark/re-mark a day */
  router.post(
    '/mark',
    authenticate,
    noAdminMark,
    requireCapability('markAttendance'),
    validateBody(markAttendanceSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const input = req.body as MarkAttendanceInput & { date?: string }
      try {
        const record = await attendanceService.markAttendance(req.user!.userId, input)
        res.json(record)
      } catch (err) {
        logger.warn({ err }, 'attendance mark failed')
        res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to record attendance' } })
      }
    },
  )

  /** GET /attendance/mine — either a date summary or a date-range list */
  router.get(
    '/mine',
    authenticate,
    requireCapability('viewOwnAttendance'),
    async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!

      // Single-date summary: ?date=YYYY-MM-DD
      if (req.query.date) {
        const date = req.query.date as string
        const summary = await attendanceService.getMyAttendance(user.userId, date)
        return res.json(summary)
      }

      // Range list: ?start=...&end=...
      const start = req.query.start as string | undefined
      const end = req.query.end as string | undefined
      const records = await attendanceService.getMyAttendanceRange(user.userId, start, end)
      return res.json({ records })
    },
  )

  /** DELETE /attendance/mine — retract a mark */
  router.delete(
    '/mine',
    authenticate,
    noAdminMark,
    requireCapability('markAttendance'),
    async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!
      const date = (req.query.date as string) ?? toDateString(new Date())
      await attendanceService.deleteMyAttendance(user.userId, date)
      res.status(204).send()
    },
  )

  // --- Team oversight (admin + hr + manager + supervisor) ----------------------

  /** GET /attendance/team — team records + KPIs for a date */
  router.get(
    '/team',
    authenticate,
    requireCapability('viewTeamAttendance'),
    async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!
      const date = (req.query.date as string) ?? toDateString(new Date())
      const result = await attendanceService.getTeamAttendance(user.userId, user.role as any, date)
      res.json(result)
    },
  )

  /** GET /attendance/team/historic — per-user history for the heatmap */
  router.get(
    '/team/historic',
    authenticate,
    requireCapability('viewTeamAttendance'),
    async (req: AuthenticatedRequest, res: Response) => {
      const user = req.user!
      const range = Number(req.query.range) || 7
      const anchor = (req.query.anchor as string) ?? toDateString(new Date())
      const byUser = await attendanceService.getTeamHistoric(user.userId, user.role as any, range, anchor)
      res.json({ byUser })
    },
  )

  return router
}
