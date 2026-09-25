import { type Request, type Response } from 'express'
import { getHoursByProject, getHoursByEmployee, getOvertimeStats, getTimesheetStatusBreakdown, type ReportFilters } from '../services/report.service.js'
import { getMargin, type MarginFilters } from '../services/margin.service.js'
import { authenticate, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js'
import { logger } from '../lib/logger.js'

function buildFilters(req: AuthenticatedRequest['query'] & { status?: string }): ReportFilters {
  return {
    startDate: req.startDate ? String(req.startDate) : undefined,
    endDate: req.endDate ? String(req.endDate) : undefined,
    projectId: req.projectId ? String(req.projectId) : undefined,
    userId: req.userId ? String(req.userId) : undefined,
    department: req.department ? String(req.department) : undefined,
    // Same narrowing pattern as the margin handler: the raw query string is
    // passed through as the union type the report services accept.
    status: (req.status ? String(req.status) : undefined) as ReportFilters['status'],
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

// Phase 7 — margin view. Unlike the other report endpoints, the period params
// are named `from`/`to` (flowIntegration.md API delta) and status defaults to
// `approved` inside getMargin — margin only means something on approved work.
export async function margin(req: AuthenticatedRequest, res: Response) {
  try {
    const data = await getMargin({
      projectId: req.query.projectId ? String(req.query.projectId) : undefined,
      assignmentId: req.query.assignmentId ? String(req.query.assignmentId) : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      status: (req.query.status ? String(req.query.status) : undefined) as MarginFilters['status'],
    })
    res.json({ data })
  } catch (err) {
    logger.error({ err }, 'failed to get margin summary')
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
  }
}

