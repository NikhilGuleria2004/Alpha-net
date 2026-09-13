import { type Request, type Response } from 'express'
import { getHoursByProject, getHoursByEmployee, getOvertimeStats, getTimesheetStatusBreakdown } from '../services/report.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'

function buildFilters(req: AuthenticatedRequest['query'] & { status?: string }) {
  return {
    startDate: req.startDate ? String(req.startDate) : undefined,
    endDate: req.endDate ? String(req.endDate) : undefined,
    projectId: req.projectId ? String(req.projectId) : undefined,
    userId: req.userId ? String(req.userId) : undefined,
    department: req.department ? String(req.department) : undefined,
    status: req.status ? String(req.status) : undefined,
  }
}

export async function hoursByProject(req: AuthenticatedRequest, res: Response) {
  try {
    const data = await getHoursByProject(buildFilters(req.query))
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get hours by project')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function hoursByEmployee(req: AuthenticatedRequest, res: Response) {
  try {
    const data = await getHoursByEmployee(buildFilters(req.query))
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get hours by employee')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function overtime(req: AuthenticatedRequest, res: Response) {
  try {
    const data = await getOvertimeStats(buildFilters(req.query))
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get overtime stats')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

export async function timesheetStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const data = await getTimesheetStatusBreakdown(buildFilters(req.query))
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get timesheet status breakdown')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}
