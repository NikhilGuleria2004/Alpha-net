import PDFDocument from 'pdfkit'
import type { Invoice } from './invoice.service.js'

export interface InvoicePdfInput {
  invoice: Invoice
  clientName?: string
  sowNumber?: string
  issuedOn: Date
}

export interface InvoicePdfOptions {
  compress?: boolean
  fontPath?: string
}

// Palette
const INK = '#1A1A1A'
const RULE = '#000000'
const MUTED = '#4B4B4B'
const FAINT = '#6B6B6B'
const SEAL = '#1F2937'
const HEADER_BG = '#EDEDED'
const ZEBRA = '#F7F7F7'

const M = 48
const COMPANY = 'Eniac Inc.'
const AGENCY_SUBTITLE = 'Office of Project Services & Disbursements'
const TERMS =
  'Payment due within 30 days of the invoice date. Remit to the address of record.'
const CERT_STATEMENT =
  'I certify that the above statement is true and correct and that payment has not been received.'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const day = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function controlNumber(invoiceNumber: string, issuedOn: Date): string {
  const year = issuedOn.getFullYear()
  const cleaned = invoiceNumber.replace(/[^A-Za-z0-9]/g, '')
  return `DCN-${year}-${cleaned}`
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

export function buildInvoicePdf(
  input: InvoicePdfInput,
  options: InvoicePdfOptions = {},
): Promise<Buffer> {
  const { invoice, clientName, sowNumber, issuedOn } = input
  const dueOn = addDays(issuedOn, 30)
  const dcn = controlNumber(invoice.invoiceNumber, issuedOn)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      compress: options.compress ?? true,
      info: {
        Title: `Invoice ${invoice.invoiceNumber} — ${COMPANY}`,
        Author: COMPANY,
        Subject: `Invoice ${invoice.invoiceNumber} for ${invoice.projectName}`,
        Creator: COMPANY,
      },
    })

    // Font registration — JetBrains Mono, with Courier fallback.
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
      .text(COMPANY.toUpperCase(), M + 54, 34, { characterSpacing: 0.5, lineBreak: false })
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
    doc.text('STATEMENT OF SERVICES', titleX, 34, { width: titleW, align: 'right', lineBreak: false })
    doc.text('RENDERED', titleX, 50, { width: titleW, align: 'right', lineBreak: false })
    doc.fillColor(MUTED).font(mono).fontSize(8)
    doc.text(`Invoice No. ${invoice.invoiceNumber}`, titleX, 68, {
      width: titleW,
      align: 'right',
      lineBreak: false,
    })

    doc.lineWidth(1).moveTo(M, 96).lineTo(contentRight, 96).strokeColor(RULE).stroke()

    // ─── Meta form block ───────────────────────────────────────────────────
    const formY = 116
    const formH = 100
    const colMid = M + (contentRight - M) / 2
    const row2Y = formY + formH / 2

    doc.lineWidth(1).strokeColor(RULE)
    doc.rect(M, formY, contentRight - M, formH).stroke()
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

    // Row 1, col 1: Bill To (label + two stacked lines, well clear of divider)
    fieldLabel('Bill To', M + pad, formY + 10)
    fieldValue(clientName || invoice.projectName, M + pad, formY + 22, colW)
    fieldValue(invoice.projectName, M + pad, formY + 35, colW)

    // Row 1, col 2: Reference / SOW
    fieldLabel('Reference / SOW', colMid + pad, formY + 10)
    fieldValue(sowNumber ? `SOW ${sowNumber}` : 'N/A', colMid + pad, formY + 22, colW)

    // Row 2, col 1: Issue / Due
    fieldLabel('Issue Date', M + pad, row2Y + 8)
    fieldValue(day(issuedOn), M + pad, row2Y + 20, colW / 2 - 8)
    fieldLabel('Due Date', M + pad + colW / 2 + 8, row2Y + 8)
    fieldValue(day(dueOn), M + pad + colW / 2 + 8, row2Y + 20, colW / 2 - 8)

    // Row 2, col 2: Billing Period / Status — lay status out so it fits inside
    // the row (previously it straddled the bottom border).
    fieldLabel('Billing Period', colMid + pad, row2Y + 8)
    fieldValue(`${invoice.weekStart} – ${invoice.weekEnd}`, colMid + pad, row2Y + 20, colW)
    fieldLabel('Status', colMid + pad, row2Y + 34)
    doc
      .fillColor(invoice.status === 'draft' ? MUTED : INK)
      .font(monoBold)
      .fontSize(7.5)
      .text(
        invoice.status === 'draft' ? 'DRAFT — NOT YET ISSUED' : 'ISSUED — PENDING PAYMENT',
        colMid + pad,
        row2Y + 44,
        { width: colW, lineBreak: false },
      )

    // ─── Amount due banner ─────────────────────────────────────────────────
    const bannerY = formY + formH + 18
    doc.lineWidth(1.25).strokeColor(RULE).rect(M, bannerY, contentRight - M, 40).stroke()
    doc
      .fillColor(FAINT)
      .font(monoBold)
      .fontSize(7)
      .text('TOTAL AMOUNT DUE (USD)', M + 16, bannerY + 16, {
        characterSpacing: 0.8,
        lineBreak: false,
      })
    doc
      .fillColor(INK)
      .font(monoBold)
      .fontSize(15)
      .text(usd.format(invoice.total), M + 16, bannerY + 12, {
        width: contentRight - M - 32,
        align: 'right',
        lineBreak: false,
      })

    // ─── Line items table (unified grid) ───────────────────────────────────
    // All rows — header + body — share a single row height so vertical
    // dividers can span the whole table cleanly and baselines align.
    const rowHeight = 24
    const padX = 10
    const tableLeft = M
    const tableRight = contentRight
    const tableWidth = tableRight - tableLeft

    // Column dividers (x positions). Widths chosen so amounts fit.
    const amountW = 100
    const rateW = 80
    const hoursW = 70
    const divAmount = tableRight - amountW - padX // vertical rule before AMOUNT
    const divRate = divAmount - rateW
    const divHours = divRate - hoursW
    const descX = tableLeft + padX
    const descW = divHours - descX - padX

    type Line = { description: string; hours?: string; rate?: string; amount: string }
    const lines: Line[] = [
      {
        description: `Professional services — ${invoice.projectName}`,
        hours: formatHours(invoice.billableHours ?? 0),
        rate: usd.format(invoice.hourlyRate),
        amount: usd.format(invoice.fixedCost),
      },
      ...invoice.variableCosts.map((vc) => ({
        description: `Variable cost — ${vc.reason}`,
        amount: usd.format(vc.amount),
      })),
    ]

    // Vertical baseline offset for text inside a row of height `rowHeight`.
    // For 8pt text in a 24pt row: cap height ≈ 5.6pt → offset ≈ (rowHeight - capH)/2 ≈ 9.
    const textOffsetY = 8.5

    const drawVerticalDividers = (topY: number, height: number) => {
      doc.lineWidth(0.5).strokeColor(RULE)
      doc.moveTo(divHours, topY).lineTo(divHours, topY + height).stroke()
      doc.moveTo(divRate, topY).lineTo(divRate, topY + height).stroke()
      doc.moveTo(divAmount, topY).lineTo(divAmount, topY + height).stroke()
    }

    const drawHeaderRow = (rowY: number) => {
      doc.rect(tableLeft, rowY, tableWidth, rowHeight).fill(HEADER_BG)
      doc.fillColor(INK).font(monoBold).fontSize(7.5)
      doc.text('DESCRIPTION OF SERVICES', descX, rowY + textOffsetY, {
        width: descW,
        lineBreak: false,
      })
      // Header labels align with the SAME anchors as the body values
      // (right-aligned to each column's right edge).
      doc.text('HOURS', divHours, rowY + textOffsetY, {
        width: divRate - divHours - padX,
        align: 'right',
        lineBreak: false,
      })
      doc.text('RATE', divRate, rowY + textOffsetY, {
        width: divAmount - divRate - padX,
        align: 'right',
        lineBreak: false,
      })
      doc.text('AMOUNT', divAmount, rowY + textOffsetY, {
        width: tableRight - divAmount - padX,
        align: 'right',
        lineBreak: false,
      })
    }

    let ty = bannerY + 40 + 26

    const pageBreakIfNeeded = (rowY: number): number => {
      if (rowY <= H - M - 200) return rowY
      doc.addPage()
      doc.lineWidth(0.5).moveTo(0, 6).lineTo(W, 6).strokeColor(RULE).stroke()
      drawHeaderRow(M + 20)
      return M + 20 + rowHeight
    }

    // Header row
    ty = pageBreakIfNeeded(ty)
    drawHeaderRow(ty)
    ty += rowHeight

    // Body rows — draw fills, text, then vertical rules that extend across
    // this row only. The full-table grid is outlined at the end.
    const bodyTop = ty
    for (const [index, line] of lines.entries()) {
      ty = pageBreakIfNeeded(ty)
      if (index % 2 === 1) {
        doc.rect(tableLeft, ty, tableWidth, rowHeight).fill(ZEBRA)
      }

      doc.fillColor(INK).font(mono).fontSize(8)
      doc.text(fitText(doc, line.description, descW), descX, ty + textOffsetY, {
        width: descW,
        lineBreak: false,
      })

      doc.fillColor(MUTED).font(mono).fontSize(8)
      doc.text(line.hours ?? '—', divHours, ty + textOffsetY, {
        width: divRate - divHours - padX,
        align: 'right',
        lineBreak: false,
      })
      doc.text(line.rate ?? '—', divRate, ty + textOffsetY, {
        width: divAmount - divRate - padX,
        align: 'right',
        lineBreak: false,
      })

      doc.fillColor(INK).font(monoBold).fontSize(8)
      doc.text(line.amount, divAmount, ty + textOffsetY, {
        width: tableRight - divAmount - padX,
        align: 'right',
        lineBreak: false,
      })

      doc.lineWidth(0.5).strokeColor(RULE)
      doc.moveTo(tableLeft, ty + rowHeight).lineTo(tableRight, ty + rowHeight).stroke()
      ty += rowHeight
    }

    // Vertical dividers spanning header + body in one pass
    const tableTop = bodyTop - rowHeight
    const tableBodyBottom = ty
    drawVerticalDividers(tableTop, tableBodyBottom - tableTop)

    // Outer border around the whole table (header + body)
    doc
      .lineWidth(1)
      .strokeColor(RULE)
      .rect(tableLeft, tableTop, tableWidth, tableBodyBottom - tableTop)
      .stroke()

    // ─── Totals ────────────────────────────────────────────────────────────
    ty = pageBreakIfNeeded(ty + 16)
    const totalsLabelX = tableRight - 280
    const totalsValueW = 110
    const totalsValueX = tableRight - totalsValueW
    const totalsLabelW = totalsValueX - totalsLabelX - 8

    const totalRow = (label: string, value: string, rowY: number, emphasize = false): number => {
      const fs = emphasize ? 10 : 8.5
      const valueFs = emphasize ? 11 : 8.5
      // Vertically center value against label baseline. PDFKit draws from
      // the top; both use the same `rowY`, and the larger font is pushed
      // down slightly so their baselines roughly agree.
      const labelY = rowY
      const valueY = rowY + (emphasize ? -1 : 0)

      doc.fillColor(INK).font(emphasize ? monoBold : mono).fontSize(fs)
      doc.text(label, totalsLabelX, labelY, { width: totalsLabelW, align: 'left', lineBreak: false })
      doc.fillColor(INK).font(emphasize ? monoBold : mono).fontSize(valueFs)
      doc.text(value, totalsValueX, valueY, { width: totalsValueW, align: 'right', lineBreak: false })
      return rowY + (emphasize ? 20 : 16)
    }

    ty = totalRow('Professional services', usd.format(invoice.fixedCost), ty)

    // ─── Phase 5: per-timesheet lines (rendered ONLY when the invoice has
    // them — legacy invoices keep the exact pre-Phase-5 layout). Rows are
    // capped so a large invoice can never push totals/certification off the
    // page; the full lineage always lives in invoice.lines on the API. ─────
    if (invoice.lines && invoice.lines.length > 0) {
      const MAX_LINE_ROWS = 30
      const shown = invoice.lines.slice(0, MAX_LINE_ROWS)
      const hidden = invoice.lines.length - shown.length

      let ly = ty + 14
      doc.fillColor(FAINT).font(monoBold).fontSize(6.5)
      doc.text(
        `${invoice.lines.length} TIMESHEET LINE${invoice.lines.length === 1 ? '' : 'S'}`,
        M,
        ly,
        { characterSpacing: 0.8, lineBreak: false },
      )
      ly += 12

      const amountW = 72
      const rateW = 62
      const hoursW = 52
      const weekW = 74
      const resourceX = tableLeft + weekW + 6
      const resourceW = tableRight - resourceX - amountW - rateW - hoursW - 18
      const hoursX = resourceX + resourceW + 6
      const rateX = hoursX + hoursW + 6
      const amountX = tableRight - amountW
      const rowH = 13

      // Header row
      doc.rect(tableLeft, ly, tableRight - tableLeft, rowH).fill(HEADER_BG)
      doc.fillColor(INK).font(monoBold).fontSize(6.5)
      doc.text('WEEK', tableLeft + 5, ly + 3.5, { width: weekW - 5, lineBreak: false })
      doc.text('RESOURCE', resourceX, ly + 3.5, { width: resourceW, lineBreak: false })
      doc.text('HOURS', hoursX, ly + 3.5, { width: hoursW, align: 'right', lineBreak: false })
      doc.text('RATE', rateX, ly + 3.5, { width: rateW, align: 'right', lineBreak: false })
      doc.text('AMOUNT', amountX, ly + 3.5, { width: amountW, align: 'right', lineBreak: false })
      ly += rowH

      shown.forEach((line, i) => {
        if (i % 2 === 1) {
          doc.rect(tableLeft, ly, tableRight - tableLeft, rowH).fill(ZEBRA)
        }
        doc.fillColor(INK).font(mono).fontSize(6.5)
        doc.text(line.weekStart, tableLeft + 5, ly + 3.5, { width: weekW - 5, lineBreak: false })
        const label = fitText(
          doc,
          line.resourceName ?? line.resourceId ?? `TS-${line.timesheetId.slice(-6)}`,
          resourceW,
        )
        doc.text(label, resourceX, ly + 3.5, { width: resourceW, lineBreak: false })
        doc.text(formatHours(line.hours), hoursX, ly + 3.5, {
          width: hoursW,
          align: 'right',
          lineBreak: false,
        })
        doc.text(usd.format(line.rate), rateX, ly + 3.5, {
          width: rateW,
          align: 'right',
          lineBreak: false,
        })
        doc.text(usd.format(line.amount), amountX, ly + 3.5, {
          width: amountW,
          align: 'right',
          lineBreak: false,
        })
        ly += rowH
      })

      if (hidden > 0) {
        doc.fillColor(FAINT).font(mono).fontSize(6.5)
        doc.text(
          `… ${hidden} additional line${hidden === 1 ? '' : 's'} — full lineage available via the invoice record`,
          tableLeft + 5,
          ly + 3.5,
          { lineBreak: false },
        )
        ly += rowH
      }

      doc
        .lineWidth(0.5)
        .strokeColor(FAINT)
        .moveTo(tableLeft, ly)
        .lineTo(tableRight, ly)
        .stroke()
      ty = ly + 6
    }

    if (invoice.variableCosts.length > 0) {
      ty = totalRow('Variable costs', usd.format(invoice.variableCostTotal), ty)
    }
    doc
      .lineWidth(1)
      .moveTo(totalsLabelX, ty + 2)
      .lineTo(tableRight, ty + 2)
      .strokeColor(RULE)
      .stroke()
    ty = totalRow('Total due (USD)', usd.format(invoice.total), ty + 10, true)

    // ─── Certification / signature block ───────────────────────────────────
    const certY = Math.min(ty + 26, H - M - 150)
    doc
      .fillColor(MUTED)
      .font(monoItalic)
      .fontSize(7.5)
      .text(CERT_STATEMENT, M, certY, { width: contentRight - M, lineBreak: false })

    // Signature lines: left line fixed width, right line anchored to the
    // content right edge so it always ends flush with the page margin.
    const sigY = certY + 30
    const sigLeftW = 220
    const sigGap = 60
    const sigRightX = M + sigLeftW + sigGap
    const sigRightEnd = contentRight

    doc.lineWidth(0.75).strokeColor(RULE)
    doc.moveTo(M, sigY).lineTo(M + sigLeftW, sigY).stroke()
    doc.moveTo(sigRightX, sigY).lineTo(sigRightEnd, sigY).stroke()

    doc.fillColor(FAINT).font(mono).fontSize(6.5)
    doc.text('Authorized Signature', M, sigY + 4, { lineBreak: false })
    doc.text('Date', sigRightX, sigY + 4, { lineBreak: false })

    // ─── Notes ─────────────────────────────────────────────────────────────
    const notesY = sigY + 26
    doc.fillColor(FAINT).font(monoBold).fontSize(6.5)
    doc.text('TERMS', M, notesY, { characterSpacing: 0.8, lineBreak: false })
    doc
      .fillColor(MUTED)
      .font(mono)
      .fontSize(7.5)
      .text(TERMS, M, notesY + 12, { width: contentRight - M, lineBreak: false })

    // ─── Watermark + footers on every page ─────────────────────────────────
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i)
      const pageY = H - M - 36

      if (invoice.status === 'draft') {
        doc
          .save()
          .rotate(35, { origin: [W / 2, H / 2] })
          .lineWidth(3)
          .strokeColor(INK)
          .strokeOpacity(0.12)
          .rect(W / 2 - 200, H / 2 - 46, 400, 92)
          .stroke()
        doc
          .fillColor(INK)
          .fillOpacity(0.1)
          .font(monoBold)
          .fontSize(44)
          .text('DRAFT — NOT FOR PAYMENT', W / 2 - 260, H / 2 - 20, {
            width: 520,
            align: 'center',
            lineBreak: false,
          })
        doc.restore()
      } else if (invoice.status === 'void') {
        // Phase 5: a voided invoice is dead paper — stamp it unmistakably.
        doc
          .save()
          .rotate(35, { origin: [W / 2, H / 2] })
          .lineWidth(3)
          .strokeColor(INK)
          .strokeOpacity(0.14)
          .rect(W / 2 - 200, H / 2 - 46, 400, 92)
          .stroke()
        doc
          .fillColor(INK)
          .fillOpacity(0.12)
          .font(monoBold)
          .fontSize(52)
          .text('VOID', W / 2 - 260, H / 2 - 32, {
            width: 520,
            align: 'center',
            lineBreak: false,
          })
        doc.restore()
      } else if (invoice.status === 'paid') {
        // Phase 5: payment received — a light PAID stamp, no alarm.
        doc
          .save()
          .rotate(35, { origin: [W / 2, H / 2] })
          .lineWidth(2.5)
          .strokeColor(INK)
          .strokeOpacity(0.1)
          .rect(W / 2 - 170, H / 2 - 40, 340, 80)
          .stroke()
        doc
          .fillColor(INK)
          .fillOpacity(0.09)
          .font(monoBold)
          .fontSize(44)
          .text('PAID', W / 2 - 260, H / 2 - 20, {
            width: 520,
            align: 'center',
            lineBreak: false,
          })
        doc.restore()
      }

      doc.lineWidth(0.5).moveTo(M, pageY).lineTo(contentRight, pageY).strokeColor(RULE).stroke()
      doc
        .fillColor(FAINT)
        .font(mono)
        .fontSize(6.5)
        .text(`${COMPANY} · ${dcn} · Generated ${day(new Date())}`, M, pageY + 10, {
          lineBreak: false,
        })
      doc
        .fillColor(FAINT)
        .font(mono)
        .fontSize(6.5)
        .text(`Page ${i - range.start + 1} of ${range.count}`, W - M - 100, pageY + 10, {
          width: 100,
          align: 'right',
          lineBreak: false,
        })

      doc.lineWidth(0.5).moveTo(0, H - 6).lineTo(W, H - 6).strokeColor(RULE).stroke()
    }

    doc.end()
  })
}