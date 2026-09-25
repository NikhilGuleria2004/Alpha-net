import { z } from 'zod'

const nameField = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(50, 'Must be 50 characters or fewer')

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100).optional(),
    firstName: nameField.optional(),
    lastName: nameField.optional(),
    email: z.string().email('Invalid email address'),
    employeeId: z.string().min(1, 'Employee ID is required'),
    department: z.string().min(1, 'Department is required'),
    role: z.enum(['admin', 'user']),
    isSupervisor: z.boolean(),
    status: z.enum(['active', 'inactive', 'invited']),
    supervisorId: z.string().nullish(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    // Flow Integration Phase 2: optional Resource enrichment (see /flowIntegration.md §5 Phase 2).
    // All optional — legacy callers omit them. Validated only when supplied.
    resourceType: z.enum(['w2', 'c2c', 'offshore', 'unknown']).optional(),
    hireDate: z.string().trim().min(1).max(30).optional(),
    payType: z.enum(['hourly', 'salary', 'contract']).optional(),
    defaultPayRate: z.number().min(0, 'Default pay rate must be 0 or greater').optional(),
    employmentStatus: z.string().trim().min(1).max(50).optional(),
    managerId: z.string().min(1).optional(),
  })
  .refine(
    (value) => Boolean(value.name) || (Boolean(value.firstName) && Boolean(value.lastName)),
    'Provide a name, or both first and last name',
  )

export const updateUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  firstName: nameField.optional(),
  lastName: nameField.optional(),
  email: z.string().email('Invalid email address').optional(),
  employeeId: z.string().min(1, 'Employee ID is required').optional(),
  department: z.string().min(1, 'Department is required').optional(),
  role: z.enum(['admin', 'user']).optional(),
  isSupervisor: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'invited']).optional(),
  supervisorId: z.string().nullish(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  // Flow Integration Phase 2: optional Resource enrichment (admin-only via PATCH /users/:id).
  // Deliberately NOT added to updateMyProfileSchema below (self-service stays restricted).
  resourceType: z.enum(['w2', 'c2c', 'offshore', 'unknown']).optional(),
  hireDate: z.string().trim().min(1).max(30).optional(),
  payType: z.enum(['hourly', 'salary', 'contract']).optional(),
  defaultPayRate: z.number().min(0, 'Default pay rate must be 0 or greater').optional(),
  employmentStatus: z.string().trim().min(1).max(50).optional(),
  managerId: z.string().min(1).nullish(),
})

// QA M4: self-service profile update. A user can change their own name,
// email, employee ID and department — but NOT role/status/isSupervisor/
// supervisorId/password (those are admin-only via PATCH /users/:id). This
// schema deliberately omits the privileged fields so a client can't smuggle
// them in.
export const updateMyProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  firstName: nameField.optional(),
  lastName: nameField.optional(),
  email: z.string().email('Invalid email address').optional(),
  employeeId: z.string().min(1, 'Employee ID is required').optional(),
  department: z.string().min(1, 'Department is required').optional(),
})

export const assignSupervisorSchema = z.object({
  supervisorId: z.string().nullish(),
})
