import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'

export default function dummyRoutes() {
  const router = Router()
  router.use(authenticate)
  router.get('/', (req, res) => res.json({ ok: true }))
  return router
}
