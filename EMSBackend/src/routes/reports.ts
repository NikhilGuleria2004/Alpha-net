import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import { reportQuerySchema } from '../schemas/finance.schema.js'
import * as reportService from '../services/reportquery.service.js'
import type { ReportResult } from '../types/finance.js'

/**
 * POST /reports/query, GET /reports/employee-stats, POST /reports/export
 * (EMSBackend §7.7).
 *
 * `/reports/query` is admin/hr/manager; an
 * employee is denied and pointed at `/reports/employee-stats` for their own
 * numbers. `/export` takes the same body and returns the same aggregation as a
 * CSV attachment, so the download can never disagree with the screen.
 */
export function reportsRoutes() {
  const router = Router()

  router.use(authenticate)

  /** Roles allowed to see the org-wide roll-up. */
  const canViewOrgReports = (req: AuthenticatedRequest): boolean => {
    const role = req.user!.role
    return role === 'admin' || role === 'hr' || role === 'manager'
  }

  const denied = (res: Response) =>
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Use /reports/employee-stats to see your own hours' },
    })

  /**
   * Resolve the query filters. Returns null
   * after writing a 400/403 response, so handlers can just bail out.
   */
  async function resolveFilters(req: AuthenticatedRequest, _res: Response) {
    const body = req.body as {
      dateRange: string
      startDate?: string
      endDate?: string
      projectId?: string
      userId?: string
      department?: string
      status?: any
    }

    const filters: Parameters<typeof reportService.runReport>[0] = {
      dateRange: body.dateRange,
      startDate: body.startDate,
      endDate: body.endDate,
      projectId: body.projectId,
      userId: body.userId,
      department: body.department,
      status: body.status,
    }

    return filters
  }

  /** POST /reports/query — the aggregation behind the Reports page. */
  router.post('/query', validateBody(reportQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
    if (!canViewOrgReports(req)) return denied(res)

    const filters = await resolveFilters(req, res)
    if (!filters) return

    try {
      const result = await reportService.runReport(filters)
      res.json(result)
    } catch (err) {
      if ((err as any)?.code === 'INVALID_RANGE') {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_RANGE', message: (err as Error).message } })
      }
      throw err
    }
  })

  /** POST /reports/export — same aggregation, CSV attachment. */
  router.post('/export', validateBody(reportQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
    if (!canViewOrgReports(req)) return denied(res)

    const filters = await resolveFilters(req, res)
    if (!filters) return

    let result: ReportResult
    try {
      result = await reportService.runReport(filters)
    } catch (err) {
      if ((err as any)?.code === 'INVALID_RANGE') {
        return res
          .status(400)
          .json({ error: { code: 'INVALID_RANGE', message: (err as Error).message } })
      }
      throw err
    }

    const range = req.body.dateRange
    res.setHeader('content-type', 'text/csv; charset=utf-8')
    res.setHeader('content-disposition', `attachment; filename="report-${range}.csv"`)
    res.send(toReportCsv(result))
  })

  /** GET /reports/employee-stats — self, any role. */
  router.get(
    '/employee-stats',
    validateQuery(reportQuerySchema.pick({ dateRange: true, startDate: true, endDate: true })),
    async (req: AuthenticatedRequest, res: Response) => {
      const { dateRange, startDate, endDate } = req.query as {
        dateRange?: string
        startDate?: string
        endDate?: string
      }
      try {
        const result = await reportService.getEmployeeStats(
          req.user!.userId,
          dateRange ?? '30d',
          startDate,
          endDate,
        )
        res.json(result)
      } catch (err) {
        if ((err as any)?.code === 'INVALID_RANGE') {
          return res
            .status(400)
            .json({ error: { code: 'INVALID_RANGE', message: (err as Error).message } })
        }
        throw err
      }
    },
  )

  return router
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One CSV with a labelled block per table, so it stays readable in a spreadsheet. */
export function toReportCsv(result: ReportResult): string {
  const lines: string[] = []

  lines.push('Hours by project')
  lines.push('Project ID,Project,Regular,Overtime,Total')
  for (const row of result.hoursByProject) {
    lines.push(
      [row.projectId, row.projectName, row.regularHours, row.overtimeHours, row.totalHours]
        .map(csvCell)
        .join(','),
    )
  }

  lines.push('')
  lines.push('Hours by employee')
  lines.push('User ID,Employee,Department,Regular,Overtime,Total')
  for (const row of result.hoursByEmployee) {
    lines.push(
      [
        row.userId,
        row.userName,
        row.department,
        row.regularHours,
        row.overtimeHours,
        row.totalHours,
      ]
        .map(csvCell)
        .join(','),
    )
  }

  lines.push('')
  lines.push('Overtime totals')
  lines.push('Regular,Overtime,Total')
  lines.push(
    [
      result.overtimeStats.regularHours,
      result.overtimeStats.overtimeHours,
      result.overtimeStats.totalHours,
    ]
      .map(csvCell)
      .join(','),
  )

  lines.push('')
  lines.push('Timesheet status breakdown')
  lines.push('Draft,Pending,Approved,Declined,Withdrawn')
  const b = result.statusBreakdown
  lines.push([b.draft, b.pending, b.approved, b.declined, b.withdrawn].map(csvCell).join(','))

  return `${lines.join('\r\n')}\r\n`
}