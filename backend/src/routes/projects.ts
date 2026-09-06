import { Router } from 'express'
import { listProjects, getProject, create, update, remove, addMember, removeMember, assignSupervisor } from '../controllers/project.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { requireProjectAccess, requireProjectEdit } from '../middleware/access.js'
import { documentsRoutes } from './documents.js'

export function projectsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', listProjects)
  router.get('/:id', requireProjectAccess, getProject)
  router.post('/', requireAdmin, create)
  router.patch('/:id', requireAdmin, requireProjectEdit, update)
  router.delete('/:id', requireAdmin, requireProjectEdit, remove)
  router.post('/:id/team', requireAdmin, requireProjectAccess, addMember)
  router.delete('/:id/team/:userId', requireAdmin, requireProjectAccess, removeMember)
  router.patch('/:id/supervisor', requireAdmin, requireProjectEdit, assignSupervisor)
  router.use('/:projectId/documents', documentsRoutes())

  return router
}
