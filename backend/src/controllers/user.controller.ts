import { type Request, type Response } from 'express'
import { getUsers, getUserById, createUser, updateUser, activateUser, deactivateUser, getUserByEmail, getUserByEmployeeId, getSupervisors, getSupervisorUsers } from '../services/user.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { createUserSchema, updateUserSchema, assignSupervisorSchema } from '../schemas/user.schema.js'
import { ObjectId } from 'mongodb'

export async function listUsers(_req: AuthenticatedRequest, res: Response) {
  const users = await getUsers()
  res.json({ users })
}

export async function getUser(req: AuthenticatedRequest, res: Response) {
  try {
    const user = await getUserById(req.params.id as string)
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    res.json({ user })
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid user ID' } })
  }
}

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const input = createUserSchema.parse(req.body)
    const existingEmail = await getUserByEmail(input.email)
    if (existingEmail) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already exists' } })
    }
    const existingEmployeeId = await getUserByEmployeeId(input.employeeId)
    if (existingEmployeeId) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'Employee ID already exists' } })
    }
    if (input.isSupervisor && input.status === 'inactive') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Inactive users cannot become supervisors' } })
    }
    if (input.supervisorId) {
      const supervisor = await getUserById(input.supervisorId)
      if (!supervisor || supervisor.status !== 'active' || !supervisor.isSupervisor) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supervisor' } })
      }
    }
    const user = await createUser(input)
    res.status(201).json({ user })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create user'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const input = updateUserSchema.parse(req.body)
    const existing = await getUserById(req.params.id as string)
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    if (input.email && input.email !== existing.email) {
      const emailTaken = await getUserByEmail(input.email)
      if (emailTaken) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Email already exists' } })
      }
    }
    if (input.employeeId && input.employeeId !== existing.employeeId) {
      const employeeIdTaken = await getUserByEmployeeId(input.employeeId)
      if (employeeIdTaken) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Employee ID already exists' } })
      }
    }
    if (input.isSupervisor === true && input.status === 'inactive') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Inactive users cannot become supervisors' } })
    }
    if (input.supervisorId === req.params.id as string) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'User cannot be their own supervisor' } })
    }
    if (input.supervisorId) {
      const supervisor = await getUserById(input.supervisorId)
      if (!supervisor || supervisor.status !== 'active' || !supervisor.isSupervisor) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supervisor' } })
      }
    }
    const user = await updateUser(req.params.id as string, input)
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    res.json({ user })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update user'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function deactivate(req: AuthenticatedRequest, res: Response) {
  const user = await deactivateUser(req.params.id as string)
  if (!user) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
  }
  res.json({ user })
}

export async function activate(req: AuthenticatedRequest, res: Response) {
  const user = await activateUser(req.params.id as string)
  if (!user) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
  }
  res.json({ user })
}

export async function assignSupervisor(req: AuthenticatedRequest, res: Response) {
  try {
    const { supervisorId } = assignSupervisorSchema.parse(req.body)
    const user = await getUserById(req.params.id as string)
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    if (supervisorId) {
      const supervisor = await getUserById(supervisorId)
      if (!supervisor || supervisor.status !== 'active' || !supervisor.isSupervisor) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supervisor' } })
      }
    }
    const updated = await updateUser(req.params.id as string, { supervisorId: supervisorId || null })
    if (!updated) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
    }
    res.json({ user: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to assign supervisor'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function listSupervisors(_req: AuthenticatedRequest, res: Response) {
  const supervisors = await getSupervisors()
  res.json({ supervisors })
}

export async function supervisorUsers(req: AuthenticatedRequest, res: Response) {
  const users = await getSupervisorUsers(req.params.id as string)
  res.json({ users })
}
