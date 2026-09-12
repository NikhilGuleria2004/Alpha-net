import { type Request, type Response } from 'express'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { getUsers, getUserById, createUser, updateUser, activateUser, deactivateUser, getUserByEmail, getUserByEmployeeId, getSupervisors, getSupervisorUsers } from '../services/user.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { createUserSchema, updateUserSchema, assignSupervisorSchema } from '../schemas/user.schema.js'
import { ObjectId } from 'mongodb'

/**
 * Non-admins get a scoped directory instead of a 403 (QA C1): only the people
 * they actually need to render the app — self, project teammates, the projects'
 * supervisor/manager, their own supervisor, and their subordinates. Sensitive
 * fields (email, employeeId) are withheld; name/department/org-hierarchy info
 * is required by every person-lookup in the UI.
 */
function toDirectoryUser(u: Record<string, any>) {
  return {
    id: u._id.toString(),
    name: u.name,
    department: u.department,
    role: u.role,
    isSupervisor: u.isSupervisor,
    status: u.status,
    supervisorId: u.supervisorId?.toString(),
  }
}

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  if (req.user?.role === 'admin') {
    const users = await getUsers({
      role: req.query.role ? String(req.query.role) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      search: req.query.q ? String(req.query.q) : undefined,
    })
    return res.json({ users })
  }

  try {
    const db = await getDb()
    const userId = new ObjectId(req.user!.userId)

    // Projects the requester can already see (same visibility the /projects
    // endpoint uses): member, supervisor, or manager.
    const projects = await db.collection(COLLECTIONS.PROJECTS).find({
      $or: [{ teamMemberIds: userId }, { supervisorId: userId }, { managerId: userId }],
    }).toArray()

    const needed = new Set<string>([req.user!.userId])
    for (const p of projects) {
      for (const id of p.teamMemberIds ?? []) needed.add(id.toString())
      if (p.supervisorId) needed.add(p.supervisorId.toString())
      if (p.managerId) needed.add(p.managerId.toString())
    }

    // Own supervisor and subordinates (the org edges the UI relies on).
    const me = await db.collection(COLLECTIONS.USERS).findOne({ _id: userId })
    if (me?.supervisorId) needed.add(me.supervisorId.toString())
    const subordinates = await db.collection(COLLECTIONS.USERS).find({ supervisorId: userId }).toArray()
    for (const s of subordinates) needed.add(s._id.toString())

    const directory = await db.collection(COLLECTIONS.USERS).find({
      _id: { $in: Array.from(needed).map((id) => new ObjectId(id)) },
    }).toArray()

    return res.json({ users: directory.map(toDirectoryUser) })
  } catch (err) {
    // Never 500 the whole directory because a scoped lookup hiccupped (QA C1:
    // this endpoint is part of the app's initial data load).
    return res.json({ users: [] })
  }
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
    // Prevent self-demotion: admin cannot change their own role
    if (input.role && input.role !== existing.role && req.params.id === req.user!.userId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'You cannot change your own role' } })
    }
    // Prevent demoting the last admin
    if (input.role === 'user' && existing.role === 'admin') {
      const adminCount = await getUsers({ role: 'admin', status: 'active' })
      if (adminCount.length <= 1) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot demote the last active admin' } })
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
  // Prevent self-deactivation
  if (req.params.id === req.user!.userId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'You cannot deactivate your own account' } })
  }
  const existing = await getUserById(req.params.id as string)
  if (!existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
  }
  // Prevent deactivating the last admin
  if (existing.role === 'admin' && existing.status === 'active') {
    const adminCount = await getUsers({ role: 'admin', status: 'active' })
    if (adminCount.length <= 1) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot deactivate the last active admin' } })
    }
  }
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
