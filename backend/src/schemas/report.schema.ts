import { z } from 'zod'

export const reportFiltersSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  projectId: z.string().optional(),
  userId: z.string().optional(),
  department: z.string().optional(),
})
