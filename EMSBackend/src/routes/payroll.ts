import { Router, type Response } from 'express'
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js'
import { requireCapability, requireRole } from '../middleware/access.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import { closePayrollSchema, payrollQuerySchema } from '../schemas/finance.schema.js'
import * as payrollService from '../services/payrollcalc.service.js'
import type { PayrollRow } from '../types/finance.js'

/**
 * GET /payroll, GET /payroll/export, POST /payroll/close (EMSBackend §7.7).
 *
 * `/export` is registered before nothing else it could shadow; `/close` is a
 * distinct verb on the collection root.
 */
export function payrollRoutes() {
  const router = Router()

  router.use(authenticate)

  /** GET /payroll — admin, hr view. */
  router.get('/', requireCapability('viewPayroll'), validateQuery(payrollQuerySchema), async (req: AuthenticatedRequest, res: Response) => {
    const { period } = req.query as { period?: string }
    const result = await payrollService.getPayroll(period)
    res.json(result)
  })

  /**
   * GET /payroll/export?period=&format=csv|pdf — attachment download for
   * `downloadBlob()`. Admin/hr only, same gate as the read.
   */
  router.get(
    '/export',
    requireCapability('viewPayroll'),
    validateQuery(payrollQuerySchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const { period, format } = req.query as { period?: string; format?: 'csv' | 'pdf' }
      const resolvedFormat = format ?? 'csv'
      const result = await payrollService.getPayroll(period)

      if (resolvedFormat === 'pdf') {
        res.setHeader('content-type', 'application/pdf')
        res.setHeader('content-disposition', `attachment; filename="payroll-${result.period}.pdf"`)
        await sendPayrollPdf(res, result.period, result.rows, result.totalGross)
        return
      }

      res.setHeader('content-type', 'text/csv; charset=utf-8')
      res.setHeader('content-disposition', `attachment; filename="payroll-${result.period}.csv"`)
      res.send(toPayrollCsv(result.period, result.rows, result.totalGross))
    },
  )

  /** POST /payroll/close — freeze a period. Admin only in v1 (no manager close). */
  router.post(
    '/close',
    requireRole('admin'),
    validateBody(closePayrollSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const { period } = req.body as { period: string }
      try {
        const summary = await payrollService.closePayroll(period, req.user!.userId)
        res.status(201).json(summary)
      } catch (err) {
        if ((err as any)?.code === 'PAYROLL_EMPTY') {
          return res
            .status(422)
            .json({ error: { code: 'PAYROLL_EMPTY', message: (err as Error).message } })
        }
        throw err
      }
    },
  )

  return router
}

const CSV_HEADERS = ['Employee', 'Role', 'Period', 'Hours', 'Rate', 'Currency', 'Gross', 'Status']

/** RFC 4180 escaping: a value with a comma/quote/newline must be quoted. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toPayrollCsv(period: string, rows: PayrollRow[], totalGross: number): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.employeeName,
        row.role,
        row.period,
        row.hours,
        row.payRate,
        row.currency,
        row.gross,
        row.status,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  lines.push(['Total', '', period, '', '', '', totalGross, ''].map(csvCell).join(','))
  return `${lines.join('\r\n')}\r\n`
}

/**
 * Stream a payslip-style PDF. Column positions are absolute points from the
 * left margin; the layout mirrors the CSV so the two agree.
 */
async function sendPayrollPdf(
  res: Response,
  period: string,
  rows: PayrollRow[],
  totalGross: number,
): Promise<void> {
  const PDFDocument = (await import('pdfkit')).default
  const doc = new PDFDocument({ margin: 50 })

  doc.pipe(res)
  doc.fontSize(18).text(`Payroll — ${period}`, { align: 'left' })
  doc.moveDown(0.5)
  doc.fontSize(10).text(`Generated ${new Date().toISOString()} · ${rows.length} employee(s)`)
  doc.moveDown(1)

  const columns = [
    { label: 'Employee', x: 50, width: 150 },
    { label: 'Role', x: 205, width: 70 },
    { label: 'Hours', x: 280, width: 50 },
    { label: 'Rate', x: 335, width: 55 },
    { label: 'Gross', x: 395, width: 65 },
    { label: 'Status', x: 465, width: 60 },
  ]

  doc.fontSize(9)
  for (const column of columns) {
    doc.text(column.label, column.x, doc.y, { width: column.width, continued: false })
  }
  doc.moveDown(0.3)

  doc.fontSize(9)
  for (const row of rows) {
    const y = doc.y
    const cells = [
      row.employeeName,
      row.role,
      String(row.hours),
      String(row.payRate),
      `${row.gross} ${row.currency}`,
      row.status,
    ]
    columns.forEach((column, index) => {
      doc.text(cells[index], column.x, y, { width: column.width })
    })
    doc.moveDown(0.2)
  }

  doc.moveDown(0.5)
  doc.fontSize(11).text(`Total gross: ${totalGross}`, { align: 'right' })
  doc.end()
}