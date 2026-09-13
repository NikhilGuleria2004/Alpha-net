import { z } from 'zod'

export const notificationIdParam = z.object({
  id: z.string(),
})

export const listNotificationsQuery = z.object({
  read: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})
