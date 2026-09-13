import { Router } from 'express'
import { listApprovals, approve, decline } from '../controllers/approval.controller.js'
import { authenticate } from '../middleware/auth.js'
import { requireTimesheetReview } from '../middleware/access.js'

export function approvalsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', listApprovals)
  router.post('/:id/approve', requireTimesheetReview, approve)
  router.post('/:id/decline', requireTimesheetReview, decline)

  return router
}
