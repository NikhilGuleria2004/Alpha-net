import { Router } from 'express'
import {
  listDailyTimesheets,
  getDailyTimesheet,
  createDailyTimesheet,
  updateDailyTimesheet,
  deleteDailyTimesheet,
  compileDailyTimesheets,
} from '../controllers/daily-timesheet.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireDailyTimesheetAccess, requireDailyTimesheetEdit } from '../middleware/access.js'

// ts.md Phase 4 — daily timesheet routes. Mounted at /api/v1/timesheets/daily
// (see app.ts) so the weekly /api/v1/timesheets/:id router never sees these
// paths. Every route sits behind `authenticate`; per-row authorisation is
// applied by the requireDailyTimesheet* guards, while list/create scope the
// caller inside the controller.
export function dailyTimesheetsRoutes() {
  const router = Router()

  router.use(authenticate)

  // Registered before the '/:id' routes so 'compile' can never be read as an id.
  router.post('/compile', compileDailyTimesheets)

  router.get('/', listDailyTimesheets)
  router.post('/', createDailyTimesheet)
  router.get('/:id', requireDailyTimesheetAccess, getDailyTimesheet)
  router.patch('/:id', requireDailyTimesheetEdit, updateDailyTimesheet)
  router.delete('/:id', requireDailyTimesheetEdit, deleteDailyTimesheet)

  return router
}
