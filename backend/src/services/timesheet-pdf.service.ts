import PDFDocument from 'pdfkit'

export interface TimesheetPdfItem {
  id: string
  weekStart: string
  weekEnd: string
  projectName: string
  clientName?: string
  status: string
  regularHours: number
  overtimeHours: number
  totalHours: number
  description?: string
  submittedAt?: string
}

export interface EmployeeTimesheetGroup {
  employee: {
    id: string
    name: string
    email: string
    employeeId?: string
    department?: string
  }
  timesheets: TimesheetPdfItem[]
  subtotalRegularHours: number
  subtotalOvertimeHours: number
  subtotalTotalHours: number
}

export interface TimesheetsPdfReportInput {
  companyName?: string
  issuedOn: Date
  adminName?: string
  filterSummary?: string
  groups: EmployeeTimesheetGroup[]
  totalCombinedRegularHours: number
  totalCombinedOvertimeHours: number
  totalCombinedHours: number
  totalTimesheetsCount: number
  totalEmployeesCount: number
}

export interface TimesheetsPdfOptions {
  compress?: boolean
  fontPath?: string
}

// Palette — exactly matching invoice-pdf.service.ts
const INK = '#1A1A1A'
const RULE = '#000000'
const MUTED = '#4B4B4B'
const FAINT = '#6B6B6B'
const SEAL = '#1F2937'
const HEADER_BG = '#EDEDED'
const ZEBRA = '#F7F7F7'
const CARD_BG = '#F9FAFB'

const M = 48
const DEFAULT_COMPANY = 'Eniac Inc.'
const AGENCY_SUBTITLE = 'Office of Project Services & Disbursements'
const CERT_STATEMENT =
  'I certify that the above statement of employee work hours is true and correct and accurately reflects all recorded timesheets.'
const ADMINISTRATIVE_NOTE =
  'Official aggregate timesheet report generated for administrative, payroll, and billing compliance.'

const day = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}.00` : hours.toFixed(2)
}

function controlNumber(issuedOn: Date): string {
  const year = issuedOn.getFullYear()
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `DCN-${year}-TS-${rand}`
}

function fitText(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  if (doc.widthOfString(text) <= maxWidth) return text
  let out = text
  while (out.length > 1 && doc.widthOfString(`${out}…`) > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out.trimEnd()}…`
}

export function buildTimesheetsPdf(
  input: TimesheetsPdfReportInput,
  options: TimesheetsPdfOptions = {},
): Promise<Buffer> {
  const {
    companyName = DEFAULT_COMPANY,
    issuedOn,
    adminName = 'Administrator',
    filterSummary,
    groups,
    totalCombinedRegularHours,
    totalCombinedOvertimeHours,
    totalCombinedHours,
    totalTimesheetsCount,
    totalEmployeesCount,
  } = input

  const dcn = controlNumber(issuedOn)
  const reportNumber = `TS-${issuedOn.getFullYear()}-${String(issuedOn.getMonth() + 1).padStart(2, '0')}${String(issuedOn.getDate()).padStart(2, '0')}`

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      compress: options.compress ?? true,
      info: {
        Title: `Timesheet Records Report — ${companyName}`,
        Author: companyName,
        Subject: `Employee Timesheet Summary Report`,
        Creator: companyName,
      },
    })

    // Font registration — JetBrains Mono, with Courier fallback (identical to invoice-pdf)
    let mono = 'Courier'
    let monoBold = 'Courier-Bold'
    let monoItalic = 'Courier-Oblique'
    if (options.fontPath) {
      try {
        doc.registerFont('Body', options.fontPath)
        doc.registerFont('Body-Bold', options.fontPath)
        doc.registerFont('Body-Italic', options.fontPath)
        mono = 'Body'
        monoBold = 'Body-Bold'
        monoItalic = 'Body-Italic'
      } catch {
        /* fall back */
      }
    }

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const H = doc.page.height
    const contentRight = W - M
    const contentWidth = contentRight - M

    // ─── Masthead ───────────────────────────────────────────────────────────
    doc.lineWidth(2).moveTo(0, 6).lineTo(W, 6).strokeColor(RULE).stroke()
    doc.lineWidth(0.5).moveTo(0, 10).lineTo(W, 10).strokeColor(RULE).stroke()

    const sealCx = M + 22
    const sealCy = 58
    doc.circle(sealCx, sealCy, 22).lineWidth(1.5).strokeColor(SEAL).stroke()
    doc.circle(sealCx, sealCy, 17).lineWidth(0.75).strokeColor(SEAL).stroke()
    doc
      .fillColor(SEAL)
      .font(monoBold)
      .fontSize(15)
      .text('E', sealCx - 22, sealCy - 8, { width: 44, align: 'center', lineBreak: false })

    doc
      .fillColor(INK)
      .font(monoBold)
      .fontSize(15)
      .text(companyName.toUpperCase(), M + 54, 34, { characterSpacing: 0.5, lineBreak: false })
    doc
      .fillColor(MUTED)
      .font(monoItalic)
      .fontSize(8.5)
      .text(AGENCY_SUBTITLE, M + 54, 54, { lineBreak: false })
    doc
      .fillColor(FAINT)
      .font(mono)
      .fontSize(7.5)
      .text('Document Control No. ' + dcn, M + 54, 68, { lineBreak: false })

    const titleW = 240
    const titleX = contentRight - titleW
    doc.fillColor(INK).font(monoBold).fontSize(11)
    doc.text('STATEMENT OF TIMESHEET', titleX, 34, { width: titleW, align: 'right', lineBreak: false })
    doc.text('RECORDS', titleX, 50, { width: titleW, align: 'right', lineBreak: false })
    doc.fillColor(MUTED).font(mono).fontSize(8)
    doc.text(`Report No. ${reportNumber}`, titleX, 68, {
      width: titleW,
      align: 'right',
      lineBreak: false,
    })

    doc.lineWidth(1).moveTo(M, 96).lineTo(contentRight, 96).strokeColor(RULE).stroke()

    // ─── Meta form block ───────────────────────────────────────────────────
    const formY = 114
    const formH = 80
    const colMid = M + contentWidth / 2
    const row2Y = formY + formH / 2

    doc.lineWidth(1).strokeColor(RULE)
    doc.rect(M, formY, contentWidth, formH).stroke()
    doc.moveTo(colMid, formY).lineTo(colMid, formY + formH).stroke()
    doc.moveTo(M, row2Y).lineTo(contentRight, row2Y).stroke()

    const pad = 14
    const colW = colMid - M - pad * 2

    const fieldLabel = (label: string, x: number, y: number) =>
      doc
        .fillColor(FAINT)
        .font(monoBold)
        .fontSize(6.5)
        .text(label.toUpperCase(), x, y, { characterSpacing: 0.8, lineBreak: false })

    const fieldValue = (value: string, x: number, y: number, width: number) =>
      doc
        .fillColor(INK)
        .font(mono)
        .fontSize(8.5)
        .text(fitText(doc, value, width), x, y, { width, lineBreak: false })

    // Row 1, col 1: Organization
    fieldLabel('Organization', M + pad, formY + 10)
    fieldValue(companyName, M + pad, formY + 22, colW)

    // Row 1, col 2: Report Scope
    fieldLabel('Report Scope', colMid + pad, formY + 10)
    fieldValue(filterSummary || 'All Recorded Timesheets', colMid + pad, formY + 22, colW)

    // Row 2, col 1: Generated On & By
    fieldLabel('Generated On / By', M + pad, row2Y + 8)
    fieldValue(`${day(issuedOn)} · ${adminName}`, M + pad, row2Y + 20, colW)

    // Row 2, col 2: Summary Stats
    fieldLabel('Active Records', colMid + pad, row2Y + 8)
    fieldValue(
      `${totalTimesheetsCount} timesheets across ${totalEmployeesCount} employee${totalEmployeesCount === 1 ? '' : 's'}`,
      colMid + pad,
      row2Y + 20,
      colW,
    )

    // ─── Total Combined Hours Banner ────────────────────────────────────────
    const bannerY = formY + formH + 16
    doc.lineWidth(1.25).strokeColor(RULE).rect(M, bannerY, contentWidth, 38).stroke()
    doc
      .fillColor(FAINT)
      .font(monoBold)
      .fontSize(7)
      .text('TOTAL HOURS WORKED COMBINED', M + 16, bannerY + 15, {
        characterSpacing: 0.8,
        lineBreak: false,
      })
    doc
      .fillColor(INK)
      .font(monoBold)
      .fontSize(15)
      .text(`${formatHours(totalCombinedHours)} HRS`, M + 16, bannerY + 11, {
        width: contentWidth - 32,
        align: 'right',
        lineBreak: false,
      })

    // ─── Table Geometry ─────────────────────────────────────────────────────
    const weekW = 100
    const projW = 159
    const statusW = 70
    const regW = 55
    const otW = 55
    const totW = 60

    const divWeek = M + weekW
    const divProj = divWeek + projW
    const divStatus = divProj + statusW
    const divReg = divStatus + regW
    const divOt = divReg + otW

    const textOffsetY = 6.5
    const headerRowHeight = 20

    const drawTableHeader = (rowY: number) => {
      doc.rect(M, rowY, contentWidth, headerRowHeight).fill(HEADER_BG)
      doc.fillColor(INK).font(monoBold).fontSize(7)
      doc.text('WEEK PERIOD', M + 6, rowY + textOffsetY, { width: weekW - 10, lineBreak: false })
      doc.text('PROJECT / CLIENT', divWeek + 6, rowY + textOffsetY, { width: projW - 10, lineBreak: false })
      doc.text('STATUS', divProj + 4, rowY + textOffsetY, { width: statusW - 8, align: 'center', lineBreak: false })
      doc.text('REGULAR', divStatus, rowY + textOffsetY, { width: regW - 6, align: 'right', lineBreak: false })
      doc.text('OVERTIME', divReg, rowY + textOffsetY, { width: otW - 6, align: 'right', lineBreak: false })
      doc.text('TOTAL', divOt, rowY + textOffsetY, { width: totW - 6, align: 'right', lineBreak: false })

      // Vertical rules inside header
      doc.lineWidth(0.5).strokeColor(RULE)
      doc.moveTo(divWeek, rowY).lineTo(divWeek, rowY + headerRowHeight).stroke()
      doc.moveTo(divProj, rowY).lineTo(divProj, rowY + headerRowHeight).stroke()
      doc.moveTo(divStatus, rowY).lineTo(divStatus, rowY + headerRowHeight).stroke()
      doc.moveTo(divReg, rowY).lineTo(divReg, rowY + headerRowHeight).stroke()
      doc.moveTo(divOt, rowY).lineTo(divOt, rowY + headerRowHeight).stroke()
      doc.rect(M, rowY, contentWidth, headerRowHeight).stroke()
    }

    let ty = bannerY + 38 + 20

    const checkPageBreak = (neededHeight: number): boolean => {
      if (ty + neededHeight <= H - M - 60) return false
      doc.addPage()
      doc.lineWidth(0.5).moveTo(0, 6).lineTo(W, 6).strokeColor(RULE).stroke()
      ty = M + 20
      return true
    }

    if (groups.length === 0) {
      checkPageBreak(80)
      doc.rect(M, ty, contentWidth, 50).fill(ZEBRA)
      doc.rect(M, ty, contentWidth, 50).lineWidth(0.75).strokeColor(RULE).stroke()
      doc.fillColor(MUTED).font(mono).fontSize(9)
      doc.text('No timesheet records found matching the requested criteria.', M, ty + 18, {
        width: contentWidth,
        align: 'center',
      })
      ty += 65
    }

    // ─── Per-Employee Sections ──────────────────────────────────────────────
    for (const group of groups) {
      const { employee, timesheets, subtotalRegularHours, subtotalOvertimeHours, subtotalTotalHours } = group

      // Ensure room for employee banner + table header + at least 1 row
      checkPageBreak(90)

      // Employee banner
      const empBannerH = 22
      doc.rect(M, ty, contentWidth, empBannerH).fill(CARD_BG)
      doc.lineWidth(0.75).strokeColor(RULE).rect(M, ty, contentWidth, empBannerH).stroke()

      const empLabel = `EMPLOYEE: ${employee.name.toUpperCase()} (${employee.email})`
      const deptLabel = `${employee.department ? employee.department.toUpperCase() : 'GENERAL'}${employee.employeeId ? ` · ID: ${employee.employeeId}` : ''}`

      doc.fillColor(INK).font(monoBold).fontSize(7.5)
      doc.text(fitText(doc, empLabel, contentWidth - 170), M + 8, ty + 7, {
        width: contentWidth - 170,
        lineBreak: false,
      })
      doc.fillColor(FAINT).font(mono).fontSize(7)
      doc.text(fitText(doc, deptLabel, 150), contentRight - 158, ty + 7, {
        width: 150,
        align: 'right',
        lineBreak: false,
      })
      ty += empBannerH

      // Table header
      drawTableHeader(ty)
      ty += headerRowHeight

      // Timesheet rows
      timesheets.forEach((ts, idx) => {
        const hasDesc = Boolean(ts.description && ts.description.trim())
        const rowH = hasDesc ? 28 : 20

        if (checkPageBreak(rowH + 20)) {
          // Drew new page — repeat employee header & table header
          doc.rect(M, ty, contentWidth, empBannerH).fill(CARD_BG)
          doc.lineWidth(0.75).strokeColor(RULE).rect(M, ty, contentWidth, empBannerH).stroke()
          doc.fillColor(INK).font(monoBold).fontSize(7.5)
          doc.text(fitText(doc, empLabel + ' (CONT.)', contentWidth - 170), M + 8, ty + 7, {
            width: contentWidth - 170,
            lineBreak: false,
          })
          ty += empBannerH
          drawTableHeader(ty)
          ty += headerRowHeight
        }

        if (idx % 2 === 1) {
          doc.rect(M, ty, contentWidth, rowH).fill(ZEBRA)
        }

        // Week period
        doc.fillColor(INK).font(mono).fontSize(7.5)
        doc.text(`${ts.weekStart} – ${ts.weekEnd.slice(5)}`, M + 6, ty + textOffsetY, {
          width: weekW - 10,
          lineBreak: false,
        })

        // Project and client
        const projTitle = ts.clientName ? `${ts.projectName} (${ts.clientName})` : ts.projectName
        doc.fillColor(INK).font(monoBold).fontSize(7.5)
        doc.text(fitText(doc, projTitle, projW - 10), divWeek + 6, ty + textOffsetY, {
          width: projW - 10,
          lineBreak: false,
        })

        // Deliverables / task description if available
        if (hasDesc) {
          doc.fillColor(FAINT).font(monoItalic).fontSize(6)
          doc.text(fitText(doc, ts.description!, projW - 10), divWeek + 6, ty + textOffsetY + 10, {
            width: projW - 10,
            lineBreak: false,
          })
        }

        // Status
        doc.fillColor(ts.status === 'APPROVED' ? INK : MUTED).font(mono).fontSize(7)
        doc.text(ts.status, divProj + 4, ty + textOffsetY, {
          width: statusW - 8,
          align: 'center',
          lineBreak: false,
        })

        // Regular hours
        doc.fillColor(MUTED).font(mono).fontSize(7.5)
        doc.text(formatHours(ts.regularHours), divStatus, ty + textOffsetY, {
          width: regW - 6,
          align: 'right',
          lineBreak: false,
        })

        // Overtime hours
        doc.text(formatHours(ts.overtimeHours), divReg, ty + textOffsetY, {
          width: otW - 6,
          align: 'right',
          lineBreak: false,
        })

        // Total hours
        doc.fillColor(INK).font(monoBold).fontSize(7.5)
        doc.text(formatHours(ts.totalHours), divOt, ty + textOffsetY, {
          width: totW - 6,
          align: 'right',
          lineBreak: false,
        })

        // Vertical dividers
        doc.lineWidth(0.5).strokeColor(RULE)
        doc.moveTo(divWeek, ty).lineTo(divWeek, ty + rowH).stroke()
        doc.moveTo(divProj, ty).lineTo(divProj, ty + rowH).stroke()
        doc.moveTo(divStatus, ty).lineTo(divStatus, ty + rowH).stroke()
        doc.moveTo(divReg, ty).lineTo(divReg, ty + rowH).stroke()
        doc.moveTo(divOt, ty).lineTo(divOt, ty + rowH).stroke()

        // Horizontal bottom row rule
        doc.moveTo(M, ty + rowH).lineTo(contentRight, ty + rowH).stroke()

        ty += rowH
      })

      // Employee Subtotal Row
      const subtotalH = 18
      doc.rect(M, ty, contentWidth, subtotalH).fill(HEADER_BG)
      doc.lineWidth(0.5).strokeColor(RULE).rect(M, ty, contentWidth, subtotalH).stroke()

      doc.fillColor(INK).font(monoBold).fontSize(7)
      doc.text(`SUBTOTAL FOR ${employee.name.toUpperCase()}:`, M + 8, ty + 5, {
        width: divStatus - M - 16,
        lineBreak: false,
      })

      doc.fillColor(INK).font(monoBold).fontSize(7.5)
      doc.text(formatHours(subtotalRegularHours), divStatus, ty + 5, {
        width: regW - 6,
        align: 'right',
        lineBreak: false,
      })
      doc.text(formatHours(subtotalOvertimeHours), divReg, ty + 5, {
        width: otW - 6,
        align: 'right',
        lineBreak: false,
      })
      doc.text(formatHours(subtotalTotalHours), divOt, ty + 5, {
        width: totW - 6,
        align: 'right',
        lineBreak: false,
      })

      ty += subtotalH + 16
    }

    // ─── Combined Totals Summary Box (End of Document) ──────────────────────
    checkPageBreak(170)

    const totalsCardW = 280
    const totalsCardX = contentRight - totalsCardW
    const totalsLabelW = 180
    const totalsValW = totalsCardW - totalsLabelW - 10
    const totalsValX = totalsCardX + totalsLabelW

    const drawTotalRow = (label: string, value: string, rowY: number, bold = false): number => {
      const fs = bold ? 9.5 : 8
      const valFs = bold ? 10.5 : 8
      doc.fillColor(INK).font(bold ? monoBold : mono).fontSize(fs)
      doc.text(label, totalsCardX + 8, rowY, { width: totalsLabelW, lineBreak: false })
      doc.fillColor(INK).font(bold ? monoBold : mono).fontSize(valFs)
      doc.text(value, totalsValX, rowY, { width: totalsValW, align: 'right', lineBreak: false })
      return rowY + (bold ? 18 : 14)
    }

    doc.lineWidth(0.75).strokeColor(RULE).rect(totalsCardX, ty, totalsCardW, 95).stroke()
    doc.rect(totalsCardX, ty, totalsCardW, 18).fill(HEADER_BG)
    doc.fillColor(INK).font(monoBold).fontSize(7)
    doc.text('COMBINED HOURS SUMMARY', totalsCardX + 8, ty + 5, {
      characterSpacing: 0.8,
      lineBreak: false,
    })

    let sy = ty + 24
    sy = drawTotalRow('Total Active Employees', `${totalEmployeesCount}`, sy)
    sy = drawTotalRow('Total Timesheet Records', `${totalTimesheetsCount}`, sy)
    sy = drawTotalRow('Total Regular Hours', `${formatHours(totalCombinedRegularHours)} hrs`, sy)
    sy = drawTotalRow('Total Overtime Hours', `${formatHours(totalCombinedOvertimeHours)} hrs`, sy)

    doc.lineWidth(1).strokeColor(RULE).moveTo(totalsCardX + 8, sy - 1).lineTo(contentRight - 8, sy - 1).stroke()
    sy += 4
    drawTotalRow('TOTAL COMBINED HOURS', `${formatHours(totalCombinedHours)} HRS`, sy, true)

    ty += 110

    // ─── Certification & Sign-off Block ─────────────────────────────────────
    checkPageBreak(85)
    const certY = ty
    doc
      .fillColor(MUTED)
      .font(monoItalic)
      .fontSize(7)
      .text(CERT_STATEMENT, M, certY, { width: contentWidth, lineBreak: false })

    const sigY = certY + 28
    const sigLeftW = 200
    const sigGap = 60
    const sigRightX = M + sigLeftW + sigGap
    const sigRightEnd = contentRight

    doc.lineWidth(0.75).strokeColor(RULE)
    doc.moveTo(M, sigY).lineTo(M + sigLeftW, sigY).stroke()
    doc.moveTo(sigRightX, sigY).lineTo(sigRightEnd, sigY).stroke()

    doc.fillColor(FAINT).font(mono).fontSize(6.5)
    doc.text('Authorized Administrator Signature', M, sigY + 4, { lineBreak: false })
    doc.text('Date', sigRightX, sigY + 4, { lineBreak: false })

    const notesY = sigY + 20
    doc.fillColor(FAINT).font(monoBold).fontSize(6.5)
    doc.text('AUDIT RECORD', M, notesY, { characterSpacing: 0.8, lineBreak: false })
    doc
      .fillColor(MUTED)
      .font(mono)
      .fontSize(7)
      .text(ADMINISTRATIVE_NOTE, M, notesY + 10, { width: contentWidth, lineBreak: false })

    // ─── Header, Page Numbers & Footers ─────────────────────────────────────
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i)
      const pageY = H - M - 28

      doc.lineWidth(0.5).moveTo(M, pageY).lineTo(contentRight, pageY).strokeColor(RULE).stroke()
      doc
        .fillColor(FAINT)
        .font(mono)
        .fontSize(6.5)
        .text(`${companyName} · ${dcn} · Generated ${day(issuedOn)}`, M, pageY + 8, {
          lineBreak: false,
        })
      doc
        .fillColor(FAINT)
        .font(mono)
        .fontSize(6.5)
        .text(`Page ${i - range.start + 1} of ${range.count}`, contentRight - 100, pageY + 8, {
          width: 100,
          align: 'right',
          lineBreak: false,
        })

      doc.lineWidth(0.5).moveTo(0, H - 6).lineTo(W, H - 6).strokeColor(RULE).stroke()
    }

    doc.end()
  })
}
