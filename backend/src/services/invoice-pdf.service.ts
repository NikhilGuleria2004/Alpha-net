import PDFDocument from 'pdfkit'
import type { Invoice } from './invoice.service.js'

/**
 * Industry-grade invoice PDF for Eniac Inc.
 *
 * Pure rendering — no DB access. The caller (controller) loads the invoice and
 * any supplementary project data, and gets back a Buffer it streams to the
 * client with `application/pdf` headers.
 */

export interface InvoicePdfInput {
  invoice: Invoice
  /** Best-effort bill-to name, from the project record. */
  clientName?: string
  sowNumber?: string
  issuedOn: Date
}

export interface InvoicePdfOptions {
  /** Disable content-stream compression (used by tests to assert on text). */
  compress?: boolean
}

// Palette — matches the app's slate/blue design tokens.
const NAVY = '#0F172A'
const ACCENT = '#2563EB'
const TEXT = '#0F172A'
const MUTED = '#64748B'
const FAINT = '#94A3B8'
const HAIRLINE = '#E2E8F0'
const TABLE_HEADER_BG = '#F1F5F9'
const ON_NAVY = '#E2E8F0'

const M = 48 // page margin
const COMPANY = 'Eniac Inc.'
const TERMS = 'Payment due within 30 days of invoice date.'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const day = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Truncate a string to fit a column width, with an ellipsis. */
function fitText(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
): string {
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

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width
    const H = doc.page.height

    // ─── Header band ────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 96).fill(NAVY)

    // Logo mark
    doc.roundedRect(M, 32, 32, 32, 7).fill(ACCENT)
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text('E', M, 39, { width: 32, align: 'center', lineBreak: false })

    // Wordmark
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(19)
      .text(COMPANY.toUpperCase(), M + 44, 38, { characterSpacing: 1.2, lineBreak: false })
    doc
      .fillColor(ON_NAVY)
      .font('Helvetica')
      .fontSize(8.5)
      .text('Project Services', M + 44, 62, { characterSpacing: 1.5, lineBreak: false })

    // Invoice label + number
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(21)
      .text('INVOICE', W - M - 180, 34, { width: 180, align: 'right', lineBreak: false })
    doc
      .fillColor(ON_NAVY)
      .font('Helvetica')
      .fontSize(10)
      .text(invoice.invoiceNumber, W - M - 180, 62, { width: 180, align: 'right', lineBreak: false })

    // ─── Meta section ───────────────────────────────────────────────────────
    const y = 128

    // Left column: bill to + project
    const leftWidth = 260
    doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(8).text('BILL TO', M, y, { characterSpacing: 1.5, lineBreak: false })
    doc
      .fillColor(TEXT)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(fitText(doc, clientName || invoice.projectName, leftWidth), M, y + 14, { lineBreak: false })
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9.5)
      .text(fitText(doc, invoice.projectName, leftWidth), M, y + 32, { lineBreak: false })
    if (sowNumber) {
      doc
        .fillColor(FAINT)
        .fontSize(9)
        .text(`SOW ${sowNumber}`, M, y + 46, { lineBreak: false })
    }

    // Right column: dates, period, status
    const labelX = W - M - 260
    const metaRows: { label: string; value: string }[] = [
      { label: 'ISSUE DATE', value: day(issuedOn) },
      { label: 'DUE DATE', value: day(dueOn) },
      { label: 'BILLING PERIOD', value: `${invoice.weekStart} – ${invoice.weekEnd}` },
      { label: 'STATUS', value: invoice.status === 'draft' ? 'DRAFT — NOT YET ISSUED' : 'ISSUED' },
    ]
    let metaY = y
    for (const row of metaRows) {
      doc.fillColor(FAINT).font('Helvetica-Bold').fontSize(8).text(row.label, labelX, metaY, { characterSpacing: 1.5, lineBreak: false })
      doc
        .fillColor(TEXT)
        .font('Helvetica')
        .fontSize(10)
        .text(row.value, W - M - 170, metaY - 1, { width: 170, align: 'right', lineBreak: false })
      metaY += 18
    }

    // ─── Amount due banner ──────────────────────────────────────────────────
    const bannerY = y + 78
    doc.rect(M, bannerY, W - M * 2, 44).fill(TABLE_HEADER_BG)
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('AMOUNT DUE (USD)', M + 16, bannerY + 15, { characterSpacing: 1.5, lineBreak: false })
    doc
      .fillColor(TEXT)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(usd.format(invoice.total), W - M - 200, bannerY + 10, { width: 184, align: 'right', lineBreak: false })

    // ─── Line items table ───────────────────────────────────────────────────
    let ty = bannerY + 44 + 32

    const colHours = W - M - 250 // right edge of HOURS column
    const colRate = W - M - 140 // right edge of RATE column
    const colAmount = W - M - 16 // right edge of AMOUNT column
    const descMaxWidth = colHours - M - 60

    const tableHeader = (rowY: number): number => {
      doc.rect(M, rowY, W - M * 2, 26).fill(TABLE_HEADER_BG)
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8)
      doc.text('DESCRIPTION', M + 12, rowY + 9, { characterSpacing: 1.2, lineBreak: false })
      doc.text('HOURS', colHours, rowY + 9, { width: 70, align: 'right', characterSpacing: 1.2, lineBreak: false })
      doc.text('RATE', colRate, rowY + 9, { width: 80, align: 'right', characterSpacing: 1.2, lineBreak: false })
      doc.text('AMOUNT', colAmount, rowY + 9, { width: 90, align: 'right', characterSpacing: 1.2, lineBreak: false })
      return rowY + 26
    }

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

    const pageBreakIfNeeded = (rowY: number): number => {
      if (rowY <= H - M - 170) return rowY
      doc.addPage()
      return tableHeader(M + 20)
    }

    ty = tableHeader(ty)
    for (const [index, line] of lines.entries()) {
      ty = pageBreakIfNeeded(ty)
      const rowHeight = 26
      if (index % 2 === 1) {
        doc.rect(M, ty, W - M * 2, rowHeight).fill('#FAFBFC')
      }
      doc
        .fillColor(TEXT)
        .font('Helvetica')
        .fontSize(9.5)
        .text(fitText(doc, line.description, descMaxWidth), M + 12, ty + 9, { lineBreak: false })
      doc
        .fillColor(MUTED)
        .fontSize(9.5)
        .text(line.hours ?? '—', colHours, ty + 9, { width: 70, align: 'right', lineBreak: false })
      doc
        .fillColor(MUTED)
        .text(line.rate ?? '—', colRate, ty + 9, { width: 80, align: 'right', lineBreak: false })
      doc
        .fillColor(TEXT)
        .font('Helvetica-Bold')
        .text(line.amount, colAmount, ty + 9, { width: 90, align: 'right', lineBreak: false })
      doc
        .lineWidth(0.5)
        .moveTo(M, ty + rowHeight)
        .lineTo(W - M, ty + rowHeight)
        .strokeColor(HAIRLINE)
        .stroke()
      ty += rowHeight
    }

    // ─── Totals ─────────────────────────────────────────────────────────────
    ty = pageBreakIfNeeded(ty + 14)
    const totalsX = W - M - 240
    const totalRow = (label: string, value: string, rowY: number, emphasize = false): number => {
      doc
        .fillColor(emphasize ? TEXT : MUTED)
        .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(emphasize ? 11 : 9.5)
        .text(label, totalsX, rowY, { lineBreak: false })
      doc
        .fillColor(emphasize ? TEXT : TEXT)
        .font(emphasize ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(emphasize ? 12 : 9.5)
        .text(value, colAmount, rowY, { width: 100, align: 'right', lineBreak: false })
      return rowY + (emphasize ? 20 : 16)
    }

    ty = totalRow('Professional services', usd.format(invoice.fixedCost), ty)
    if (invoice.variableCosts.length > 0) {
      ty = totalRow('Variable costs', usd.format(invoice.variableCostTotal), ty)
    }
    doc
      .lineWidth(1)
      .moveTo(totalsX, ty + 2)
      .lineTo(W - M, ty + 2)
      .strokeColor(NAVY)
      .stroke()
    ty = totalRow('Total due (USD)', usd.format(invoice.total), ty + 10, true)

    // ─── Notes ──────────────────────────────────────────────────────────────
    const notesY = Math.min(ty + 28, H - M - 130)
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text('NOTES', M, notesY, { characterSpacing: 1.5, lineBreak: false })
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(TERMS, M, notesY + 14, { width: W - M * 2, lineBreak: false })
    doc
      .fillColor(TEXT)
      .font('Helvetica')
      .fontSize(9)
      .text('Thank you for your business.', M, notesY + 30, { lineBreak: false })

    // ─── Watermark + footers on every page ──────────────────────────────────
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i)
      const pageY = H - M - 40

      if (invoice.status === 'draft') {
        doc
          .save()
          .rotate(45, { origin: [W / 2, H / 2] })
          .fillColor(NAVY)
          .fillOpacity(0.06)
          .font('Helvetica-Bold')
          .fontSize(110)
          .text('DRAFT', W / 2 - 220, H / 2 - 40, { width: 440, align: 'center', lineBreak: false })
        doc.restore()
      }

      doc
        .lineWidth(0.5)
        .moveTo(M, pageY)
        .lineTo(W - M, pageY)
        .strokeColor(HAIRLINE)
        .stroke()
      doc
        .fillColor(FAINT)
        .font('Helvetica')
        .fontSize(7.5)
        .text(
          `${COMPANY} · ${invoice.invoiceNumber} · Generated ${day(new Date())}`,
          M,
          pageY + 10,
          { lineBreak: false },
        )
      doc
        .fillColor(FAINT)
        .fontSize(7.5)
        .text(`Page ${i - range.start + 1} of ${range.count}`, W - M - 100, pageY + 10, {
          width: 100,
          align: 'right',
          lineBreak: false,
        })
    }

    doc.end()
  })
}
