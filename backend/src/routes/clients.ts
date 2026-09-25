import { Router } from 'express'
import { listClientsHandler, getClientHandler, createClientHandler, updateClientHandler } from '../controllers/client.controller.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'

// Flow Integration Phase 1 — Clients routes (see /flowIntegration.md §5 Phase 1).
// Reads: any authenticated user. Writes: admin only. Mounted at /api/v1/clients.
export function clientsRoutes() {
  const router = Router()
  router.use(authenticate)

  router.get('/', listClientsHandler)
  router.get('/:id', getClientHandler)
  router.post('/', requireAdmin, createClientHandler)
  router.patch('/:id', requireAdmin, updateClientHandler)

  return router
}
