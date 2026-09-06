import { z } from 'zod'

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  employeeId: z.string().min(1, 'Employee ID is required'),
  department: z.string().min(1, 'Department is required'),
  role: z.enum(['admin', 'user']),
  isSupervisor: z.boolean(),
  status: z.enum(['active', 'inactive']),
  supervisorId: z.string().nullish(),
  password: z.string().min(1, 'Password is required'),
})

export const updateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email('Invalid email address').optional(),
  employeeId: z.string().min(1, 'Employee ID is required').optional(),
  department: z.string().min(1, 'Department is required').optional(),
  role: z.enum(['admin', 'user']).optional(),
  isSupervisor: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  supervisorId: z.string().nullish(),
  password: z.string().min(1, 'Password is required').optional(),
})

export const assignSupervisorSchema = z.object({
  supervisorId: z.string().nullish(),
})
