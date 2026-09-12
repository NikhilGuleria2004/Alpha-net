import { type Request, type Response } from 'express'
import { getHoursByProject, getHoursByEmployee, getOvertimeStats, getTimesheetStatusBreakdown } from '../services/report.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'

export async function hoursByProject(req: AuthenticatedRequest, res: Response) {
  try {
    const filters = {
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
      userId: req.query.userId ? String(req.query.userId) : undefined,
      department: req.query.department ? String(req.query.department) : undefined,
    }
    const data = await getHoursByProject(filters)
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get hours by project')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function hoursByEmployee(req: AuthenticatedRequest, res: Response) {
  try {
    const filters = {
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
      userId: req.query.userId ? String(req.query.userId) : undefined,
      department: req.query.department ? String(req.query.department) : undefined,
    }
    const data = await getHoursByEmployee(filters)
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get hours by employee')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function overtime(req: AuthenticatedRequest, res: Response) {
  try {
    const filters = {
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
      userId: req.query.userId ? String(req.query.userId) : undefined,
      department: req.query.department ? String(req.query.department) : undefined,
    }
    const data = await getOvertimeStats(filters)
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get overtime stats')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function timesheetStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const filters = {
      startDate: req.query.startDate ? String(req.query.startDate) : undefined,
      endDate: req.query.endDate ? String(req.query.endDate) : undefined,
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
      userId: req.query.userId ? String(req.query.userId) : undefined,
      department: req.query.department ? String(req.query.department) : undefined,
    }
    const data = await getTimesheetStatusBreakdown(filters)
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get timesheet status breakdown')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}
