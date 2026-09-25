import { type Response } from 'express'
import { logger } from '../lib/logger.js'
import { createClientSchema, updateClientSchema } from '../schemas/client.schema.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import { listClients, getClientById, createClient, updateClient } from '../services/client.service.js'

// Flow Integration Phase 1 — Clients controller (see /flowIntegration.md §5 Phase 1).
// Read endpoints: any authenticated user. Write endpoints: admin only
// (enforced by requireAdmin in routes/clients.ts).

export async function listClientsHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const clients = await listClients()
    res.json({ clients })
  } catch (err) {
    logger.error({ err }, 'failed to list clients')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function getClientHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const client = await getClientById(req.params.id as string)
    if (!client) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    }
    res.json({ client })
  } catch (err) {
    logger.error({ err }, 'failed to get client')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function createClientHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = createClientSchema.parse(req.body)
    const client = await createClient(body, req.user!.userId)
    res.status(201).json({ client })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create client'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function updateClientHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const body = updateClientSchema.parse(req.body)
    const client = await updateClient(req.params.id as string, body)
    if (!client) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Client not found' } })
    }
    res.json({ client })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update client'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}
