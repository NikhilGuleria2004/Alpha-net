import { Router } from 'express'
import { listActivities, getUserActivities, getProjectActivities, getTimesheetActivities } from '../controllers/activity.controller.js'
import { authenticate } from '../middleware/auth.js'

export function activitiesRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', listActivities)
  router.get('/users/:userId', getUserActivities)
  router.get('/projects/:projectId', getProjectActivities)
  router.get('/timesheets/:timesheetId', getTimesheetActivities)

  return router
}
