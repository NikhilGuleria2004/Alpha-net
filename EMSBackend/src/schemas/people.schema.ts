import { z } from 'zod'

export const createOnboardingSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  employeeId: z.string().min(1).max(50),
  department: z.string().min(1),
  role: z.enum(['admin', 'hr', 'manager', 'employee']),
  billable: z.boolean().optional(),
  payRate: z.number().min(0).optional(),
  currency: z.enum(['USD', 'INR', 'EUR', 'GBP']).optional(),
})

export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  employeeId: z.string().min(1).max(50),
  department: z.string().min(1),
  role: z.enum(['admin', 'hr', 'manager', 'employee']),
  title: z.string().max(200).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract']).optional(),
  billable: z.boolean().optional(),
  payRate: z.number().min(0).optional(),
  currency: z.enum(['USD', 'INR', 'EUR', 'GBP']).optional(),
  managerId: z.string().optional(),
  supervisorId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
})

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'invited', 'on_leave']).optional(),
})

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(200),
})

export type CreateOnboardingInput = z.infer<typeof createOnboardingSchema>
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
