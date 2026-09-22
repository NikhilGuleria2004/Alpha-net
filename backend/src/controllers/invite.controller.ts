import { type Request, type Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/auth.js'
import { createInvite, listInvites, redeemInvite, resendInvite, revokeInvite, findInviteByToken } from '../services/invite.service.js'
import { createInviteSchema, redeemInviteSchema, resendInviteSchema, revokeInviteSchema } from '../schemas/invite.schema.js'
import { logger } from '../lib/logger.js'

export async function createHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const input = createInviteSchema.parse(req.body)
    const invite = await createInvite({ ...input, invitedBy: req.user!.userId })
    res.status(201).json({ invite })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create invite'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function listHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const filters = {
      status: req.query.status ? (req.query.status as 'pending' | 'accepted' | 'expired') : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    }
    const invites = await listInvites(filters)
    res.json({ invites })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list invites'
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } })
  }
}

export async function redeemHandler(req: Request, res: Response) {
  try {
    const { token, password } = redeemInviteSchema.parse(req.body)
    const result = await redeemInvite({ token, password })
    if (!result.user || !result.invite) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid or expired invite token' } })
    }
    res.json({ user: result.user, invite: result.invite })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to redeem invite'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function resendHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const { inviteId } = resendInviteSchema.parse(req.body)
    const invite = await resendInvite(inviteId)
    if (!invite) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invite not found or already accepted' } })
    }
    res.json({ invite })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to resend invite'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function revokeHandler(req: AuthenticatedRequest, res: Response) {
  try {
    const { inviteId } = revokeInviteSchema.parse(req.body)
    const success = await revokeInvite(inviteId)
    if (!success) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invite not found' } })
    }
    res.status(204).send()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to revoke invite'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function getByTokenHandler(req: Request, res: Response) {
  try {
    const token = req.query.token as string
    if (!token) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Token is required' } })
    }
    const invite = await findInviteByToken(token)
    if (!invite) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invite not found' } })
    }
    res.json({ invite })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to lookup invite'
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } })
  }
}
