import { type Request, type Response } from 'express'
import {
  createActivity,
  getActivitiesByUserId,
  getActivitiesByProjectId,
  getActivitiesByTimesheetId,
  getActivitiesByProjectIds,
  getAllActivities,
} from '../services/activity.service.js'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { canAccessProject, canAccessTimesheet } from '../middleware/access.js'
import { parseObjectId } from '../lib/objectid.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { getAccessibleProjectIds } from '../services/project.service.js'
import { logger } from '../lib/logger.js'

export async function listActivities(req: AuthenticatedRequest, res: Response) {
  try {
    const db = await getDb()
    const userId = req.user!.userId
    const role = req.user!.role
    const isSupervisor = req.user!.isSupervisor
    const isAdmin = role === 'admin'

    const queryUserId = req.query.userId ? String(req.query.userId) : undefined
    const queryProjectId = req.query.projectId ? String(req.query.projectId) : undefined
    const queryTimesheetId = req.query.timesheetId ? String(req.query.timesheetId) : undefined

    // POST /activities already enforces project/timesheet access on creation, and
    // the scoped endpoints (/users/:id, /projects/:id, /timesheets/:id) each do
    // their own checks. The collection endpoint was left unscoped (QA C4); scope it
    // here so non-admin users only see activity from projects they can access.
    if (!isAdmin) {
      // Gate an explicit ?projectId= by canAccessProject (403 if denied) — mirrors
      // getProjectActivities and closes the IDOR-style enumeration vector.
      if (queryProjectId) {
        const hasAccess = await canAccessProject(userId, role, isSupervisor, queryProjectId)
        if (!hasAccess) {
          return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this project' } })
        }
      }
      // Non-admins may only use ?userId= to read their own feed, or (supervisors)
      // a subordinate's feed. Everything else is rejected rather than silently
      // returning nothing.
      if (queryUserId) {
        if (queryUserId === userId) {
          // reading own feed — pass through
        } else if (isSupervisor) {
          const subordinate = await db.collection(COLLECTIONS.USERS).findOne({
            _id: new ObjectId(queryUserId),
            supervisorId: new ObjectId(userId),
          })
          if (!subordinate) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'You can only view your own activity, or that of users you supervise' } })
          }
        } else {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'You can only view your own activity, or that of users you supervise' } })
        }
      }
      // Plain employees can't use ?timesheetId= on the collection endpoint (that
      // access path is covered by /activities/timesheets/:id which does its own
      // check). Restrict to admin to keep the contract simple.
      if (queryTimesheetId) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The timesheet filter is only available to administrators on the collection endpoint' } })
      }
    }

    // Accessible-project scoping for non-admins: fetch the project IDs the caller
    // can see (member projects for employees, + supervised + subordinates' projects
    // for supervisors). Activities outside that set are never returned.
    let activities: Awaited<ReturnType<typeof getAllActivities>>
    if (isAdmin) {
      activities = await getAllActivities({
        userId: queryUserId,
        projectId: queryProjectId,
        timesheetId: queryTimesheetId,
      })
    } else {
      const accessible = await getAccessibleProjectIds(userId, role, isSupervisor)
      activities = accessible.length === 0
        ? []
        : await getActivitiesByProjectIds(accessible)
      // Apply any admin-style filters that survived the non-admin gates above.
      if (queryUserId) {
        activities = activities.filter((a) => a.userId === queryUserId)
      }
      if (queryProjectId) {
        activities = activities.filter((a) => a.projectId === queryProjectId)
      }
    }

    res.json({ activities })
  } catch (err) {
    logger.error({ err }, 'failed to list activities')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load activities' } })
  }
}

export async function getUserActivities(req: AuthenticatedRequest, res: Response) {
  try {
    const isAdmin = req.user?.role === 'admin'
    const isSelf = req.params.userId === req.user!.userId
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } })
    }
    const activities = await getActivitiesByUserId(String(req.params.userId))
    res.json({ activities })
  } catch (err) {
    logger.error({ err }, 'failed to get user activities')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load activities' } })
  }
}

export async function getProjectActivities(req: AuthenticatedRequest, res: Response) {
  try {
    const projectId = String(req.params.projectId)
    if (!projectId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Project ID is required' } })
    }
    const hasAccess = await canAccessProject(req.user!.userId, req.user!.role, req.user!.isSupervisor, projectId)
    if (!hasAccess) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this project' } })
    }
    const activities = await getActivitiesByProjectId(projectId)
    res.json({ activities })
  } catch (err) {
    logger.error({ err }, 'failed to get project activities')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load activities' } })
  }
}

export async function getTimesheetActivities(req: AuthenticatedRequest, res: Response) {
  try {
    const timesheetId = String(req.params.timesheetId)
    if (!timesheetId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Timesheet ID is required' } })
    }
    const hasAccess = await canAccessTimesheet(req.user!.userId, req.user!.role, req.user!.isSupervisor, timesheetId)
    if (!hasAccess) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this timesheet' } })
    }
    const activities = await getActivitiesByTimesheetId(timesheetId)
    res.json({ activities })
  } catch (err) {
    logger.error({ err }, 'failed to get timesheet activities')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load activities' } })
  }
}

export async function createActivityForRequest(req: AuthenticatedRequest, res: Response) {
  try {
    const actorId = req.user!.userId
    const body = (req.body ?? {}) as { projectId?: string; timesheetId?: string; description?: string }

    const description = String(body.description ?? '').trim()
    if (!description) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Description is required' } })
    }
    if (description.length > 500) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Description must be 500 characters or fewer' } })
    }

    let projectId: string | undefined
    if (body.projectId) {
      const parsed = parseObjectId(body.projectId)
      const hasAccess = await canAccessProject(actorId, req.user!.role, req.user!.isSupervisor, parsed.toString())
      if (!hasAccess) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this project' } })
      }
      projectId = parsed.toString()
    }

    let timesheetId: string | undefined
    if (body.timesheetId) {
      const parsed = parseObjectId(body.timesheetId)
      const hasAccess = await canAccessTimesheet(actorId, req.user!.role, req.user!.isSupervisor, parsed.toString())
      if (!hasAccess) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this timesheet' } })
      }
      timesheetId = parsed.toString()
    }

    const activity = await createActivity({
      userId: actorId,
      projectId,
      timesheetId,
      description,
    })

    res.status(201).json({ activity })
  } catch (err) {
    logger.error({ err }, 'failed to create activity')
    const message = err instanceof Error ? err.message : 'Failed to create activity'
    if (message.includes('Invalid ID')) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } })
    } else {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create activity' } })
    }
  }
}

