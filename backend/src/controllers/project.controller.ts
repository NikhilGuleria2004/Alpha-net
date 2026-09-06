import { type Request, type Response } from 'express'
import { getProjects, getProjectById, createProject, updateProject, deleteProject, addTeamMember, removeTeamMember, assignSupervisor as assignProjectSupervisor, canAccessProject, getProjectsForUser } from '../services/project.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireProjectAccess, requireProjectEdit } from '../middleware/access.js'
import { getUserById } from '../services/user.service.js'
import { createProjectSchema, updateProjectSchema, addTeamMemberSchema, assignProjectSupervisorSchema } from '../schemas/project.schema.js'
import { ObjectId } from 'mongodb'

export async function listProjects(req: AuthenticatedRequest, res: Response) {
  const projects = await getProjectsForUser(req.user!.userId, req.user!.role, req.user!.isSupervisor)
  res.json({ projects })
}

export async function getProject(req: AuthenticatedRequest, res: Response) {
  const hasAccess = await canAccessProject(req.user!.userId, req.user!.role, req.user!.isSupervisor, req.params.id as string)
  if (!hasAccess) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this project' } })
  }
  const project = await getProjectById(req.params.id as string)
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
  }
  res.json({ project })
}

export async function create(req: AuthenticatedRequest, res: Response) {
  try {
    const input = createProjectSchema.parse(req.body)

    const startDate = new Date(input.startDate)
    const endDate = new Date(input.endDate)
    const deadline = new Date(input.deadline)

    if (startDate > endDate) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Start date must be before end date' } })
    }
    if (deadline < startDate || deadline > endDate) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Deadline must be between start date and end date' } })
    }

    const manager = await getUserById(input.managerId)
    if (!manager || manager.status !== 'active') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Manager not found or inactive' } })
    }

    const supervisor = await getUserById(input.supervisorId)
    if (!supervisor || supervisor.status !== 'active' || !supervisor.isSupervisor) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supervisor' } })
    }

    for (const memberId of input.teamMemberIds) {
      const member = await getUserById(memberId)
      if (!member || member.status !== 'active') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Team member ${memberId} not found or inactive` } })
      }
    }

    const project = await createProject(input)
    res.status(201).json({ project })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create project'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function update(req: AuthenticatedRequest, res: Response) {
  try {
    const input = updateProjectSchema.parse(req.body)

    if (input.startDate && input.endDate) {
      const startDate = new Date(input.startDate)
      const endDate = new Date(input.endDate)
      if (startDate > endDate) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Start date must be before end date' } })
      }
    }
    if (input.startDate && input.deadline) {
      const startDate = new Date(input.startDate)
      const deadline = new Date(input.deadline)
      if (deadline < startDate) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Deadline must be after start date' } })
      }
    }
    if (input.endDate && input.deadline) {
      const endDate = new Date(input.endDate)
      const deadline = new Date(input.deadline)
      if (deadline > endDate) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Deadline must be before end date' } })
      }
    }

    if (input.managerId) {
      const manager = await getUserById(input.managerId)
      if (!manager || manager.status !== 'active') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Manager not found or inactive' } })
      }
    }

    if (input.supervisorId) {
      const supervisor = await getUserById(input.supervisorId)
      if (!supervisor || supervisor.status !== 'active' || !supervisor.isSupervisor) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supervisor' } })
      }
    }

    const project = await updateProject(req.params.id as string, input)
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
    }
    res.json({ project })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update project'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const deleted = await deleteProject(req.params.id as string)
  if (!deleted) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
  }
  res.status(204).send()
}

export async function addMember(req: AuthenticatedRequest, res: Response) {
  const project = await getProjectById(req.params.id as string)
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
  }
  if (project.status === 'archived') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Cannot add members to archived project' } })
  }

  const userId = req.body.userId
  if (!userId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'userId is required' } })
  }

  const member = await getUserById(userId)
  if (!member || member.status !== 'active') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'User not found or inactive' } })
  }

  const updated = await addTeamMember(req.params.id as string, userId)
  if (!updated) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'User is already a team member' } })
  }
  res.json({ project: updated })
}

export async function removeMember(req: AuthenticatedRequest, res: Response) {
  const project = await getProjectById(req.params.id as string)
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
  }

  const updated = await removeTeamMember(req.params.id as string, req.params.userId as string)
  if (!updated) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User is not a team member' } })
  }
  res.json({ project: updated })
}

export async function assignSupervisor(req: AuthenticatedRequest, res: Response) {
  try {
    const { supervisorId } = assignProjectSupervisorSchema.parse(req.body)
    const project = await getProjectById(req.params.id as string)
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } })
    }

    const supervisor = await getUserById(supervisorId)
    if (!supervisor || supervisor.status !== 'active' || !supervisor.isSupervisor) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid supervisor' } })
    }

    const updated = await assignProjectSupervisor(req.params.id as string, supervisorId)
    res.json({ project: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to assign supervisor'
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
  }
}
