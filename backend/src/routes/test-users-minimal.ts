import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.js'

export default function usersRoutes() {
  const router = Router()
  router.use(authenticate)
  router.get('/', requireAdmin, (req, res) => res.json({ users: [] }))
  router.get('/:id', (req, res) => res.json({ user: { id: req.params.id } }))
  return router
}
