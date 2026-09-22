import { z } from 'zod'

const nameField = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(50, 'Must be 50 characters or fewer')

export const createInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['user', 'supervisor', 'admin']),
  // Full profile — captured up front so the user record is complete the
  // moment the invite is created (no more nameless/department-less rows).
  firstName: nameField,
  lastName: nameField,
  employeeId: z.string().trim().max(50).optional(),
  department: z.string().trim().max(100).optional(),
  supervisorId: z.string().optional(),
  projectId: z.string().optional(),
})

export const redeemInviteSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  // Optional profile completion — anything the admin didn't capture at invite
  // time can be filled in here when the invitee activates their account.
  firstName: nameField.optional(),
  lastName: nameField.optional(),
  employeeId: z.string().trim().max(50).optional(),
  department: z.string().trim().max(100).optional(),
})

export const resendInviteSchema = z.object({
  inviteId: z.string().min(1, 'Invite ID is required'),
})

export const revokeInviteSchema = z.object({
  inviteId: z.string().min(1, 'Invite ID is required'),
})

export const listInvitesQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'expired']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})
