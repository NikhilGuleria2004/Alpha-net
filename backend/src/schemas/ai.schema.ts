import { z } from 'zod'

export const aiChatRequestSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(4000, 'Message too long (max 4000 characters)'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        content: z.string(),
      }),
    )
    .max(50, 'History too long (max 50 messages)')
    .optional()
    .default([]),
})
