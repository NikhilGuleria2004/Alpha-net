import { Router } from 'express'
import { listTimesheets, getTimesheet, create, update, submit, withdraw } from '../controllers/timesheet.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireTimesheetAccess, requireTimesheetEdit } from '../middleware/access.js'

export function timesheetsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', listTimesheets)
  router.get('/:id', requireTimesheetAccess, getTimesheet)
  router.post('/', create)
  router.patch('/:id', requireTimesheetEdit, update)
  router.post('/:id/submit', requireTimesheetEdit, submit)
  router.post('/:id/withdraw', requireTimesheetEdit, withdraw)

  return router
}
