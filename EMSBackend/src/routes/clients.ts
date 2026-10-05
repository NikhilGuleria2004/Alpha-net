import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireCapability } from '../middleware/access.js'
import { validateBody } from '../middleware/validate.js'
import { createClientSchema, createContactSchema, type CreateClientInput } from '../schemas/commercial.schema.js'
import * as clientService from '../services/client.service.js'
import { resolveRequesterName } from './_shared.js'
import { logger } from '../lib/logger.js'

/**
 * GET|POST /clients, GET /clients/:id, POST /clients/:id/contacts
 * (EMSBackend §7.6). `/clients` is guarded by the manageClients capability,
 * which admin and manager both hold (§6.2).
 */
export function clientsRoutes() {
  const router = Router()

  router.use(authenticate, requireCapability('manageClients'))

  /** GET /clients — { clients, total } */
  router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
    const result = await clientService.listClients()
    res.json(result)
  })

  /** POST /clients — server-generated clientCode + seeded activity row. */
  router.post('/', validateBody(createClientSchema), async (req: AuthenticatedRequest, res: Response) => {
    const input = req.body as CreateClientInput
    try {
      const client = await clientService.createClient(input, req.user!.userId, await resolveRequesterName(req.user!.userId))
      res.status(201).json({ client })
    } catch (err) {
      const code = (err as any)?.code
      if (code === 'CLIENT_EXISTS') {
        return res.status(409).json({ error: { code: 'CONFLICT', message: (err as Error).message } })
      }
      if (code === 'VALIDATION_ERROR') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: (err as Error).message } })
      }
      logger.warn({ err }, 'client creation failed')
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create client' } })
    }
  })

  /** GET /clients/:id — { client, projects, contacts, activity } */
  router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const detail = await clientService.getClientDetail(String(req.params.id))
    if (!detail) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    }
    res.json(detail)
  })

  /** POST /clients/:id/contacts — adds a client_contacts row. */
  router.post('/:id/contacts', validateBody(createContactSchema), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contact = await clientService.addClientContact(
        String(req.params.id),
        req.body as { name: string; email?: string; phone?: string },
        req.user!.userId,
        await resolveRequesterName(req.user!.userId),
      )
      res.status(201).json({ contact })
    } catch (err) {
      if ((err as any)?.code === 'NOT_FOUND') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
      }
      logger.warn({ err }, 'client contact creation failed')
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to add contact' } })
    }
  })

  return router
}