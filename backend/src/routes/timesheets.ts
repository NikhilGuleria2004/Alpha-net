import { Router } from 'express'
import { listTimesheets, getTimesheet, create, update, submit, withdraw, createWeeklyDraftsCron } from '../controllers/timesheet.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireTimesheetAccess, requireTimesheetEdit } from '../middleware/access.js'

export function timesheetsRoutes() {
  const router = Router()

  // QA C3-style: the weekly-draft cron must NOT sit behind `authenticate`
  // (JWT verification) — a scheduler holding only CRON_SECRET must reach it.
  // Mount it first and let the controller self-protect with a Bearer check.
  router.post('/cron/weekly', createWeeklyDraftsCron)

  router.use(authenticate)

  router.get('/', listTimesheets)
  router.get('/:id', requireTimesheetAccess, getTimesheet)
  router.post('/', create)
  router.patch('/:id', requireTimesheetEdit, update)
  router.post('/:id/submit', requireTimesheetEdit, submit)
  router.post('/:id/withdraw', requireTimesheetEdit, withdraw)

  return router
}
