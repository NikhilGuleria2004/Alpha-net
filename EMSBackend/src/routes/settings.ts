import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireRole } from '../middleware/access.js'
import { validateBody } from '../middleware/validate.js'
import { updateMySettingsSchema, updateOrgSettingsSchema } from '../schemas/finance.schema.js'
import * as settingsService from '../services/settings.service.js'

/**
 * GET|PUT /settings/org, GET|PUT /settings/me (EMSBackend §7.8).
 *
 * Org settings: admin writes, admin + hr read (HR needs the leave policy to
 * explain requests). Personal settings are self-service with no gate.
 */
export function settingsRoutes() {
  const router = Router()

  router.use(authenticate)

  /** GET /settings/org — admin + hr. */
  router.get('/org', requireRole('admin', 'hr'), async (_req: AuthenticatedRequest, res: Response) => {
    const settings = await settingsService.getOrgSettings()
    res.json({ settings })
  })

  /** PUT /settings/org — admin only. */
  router.put(
    '/org',
    requireRole('admin'),
    validateBody(updateOrgSettingsSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const settings = await settingsService.updateOrgSettings(
        req.body as never,
        req.user!.userId,
      )
      res.json({ settings })
    },
  )

  /** GET /settings/me — self. */
  router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
    const settings = await settingsService.getUserSettings(req.user!.userId)
    res.json({ settings })
  })

  /** PUT /settings/me — self, partial (unsent fields keep their value). */
  router.put(
    '/me',
    validateBody(updateMySettingsSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const settings = await settingsService.updateUserSettings(req.user!.userId, req.body as never)
      res.json({ settings })
    },
  )

  return router
}