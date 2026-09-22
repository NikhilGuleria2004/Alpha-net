/// <reference types="vitest" />

import { describe, it, expect } from 'vitest'
import { buildInvoicePdf } from '../services/invoice-pdf.service.js'
import type { Invoice } from '../services/invoice.service.js'

function mockInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'invoice-id-1',
    invoiceNumber: 'INV-2026-0001',
    projectId: 'project-id-1',
    projectName: 'Apollo Platform Rebuild',
    weekStart: '2026-01-05',
    weekEnd: '2026-03-29',
    periodLabel: 'All logged time · Jan 5 – Mar 29, 2026',
    hourlyRate: 75,
    billableHours: 52,
    fixedCost: 3900,
    variableCosts: [
      { id: 'vc-1', amount: 150, reason: 'Travel' },
    ],
    variableCostTotal: 150,
    total: 4050,
    status: 'draft',
    createdBy: 'admin-id-1',
    createdByName: 'Admin User',
    createdAt: new Date('2026-04-01T10:00:00Z'),
    updatedAt: new Date('2026-04-01T10:00:00Z'),
    ...overrides,
  } as Invoice
}

/**
 * pdfkit 0.20 encodes page text as WinAnsi hex strings (`<41636d65…> TJ`).
 * Decoding every hex run in file order reconstructs the drawn text corpus
 * (per-glyph kerning splits keep their order, so words stay intact).
 */
function decodePdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  const runs = [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
  return runs.join('')
}

describe('invoice PDF builder', () => {
  it('renders a valid PDF document for a draft invoice', async () => {
    const pdf = await buildInvoicePdf({
      invoice: mockInvoice(),
      clientName: 'Acme Corporation',
      sowNumber: 'SOW-2026-014',
      issuedOn: new Date('2026-04-01T10:00:00Z'),
    })

    // PDF magic number + closing marker — a structurally valid document.
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(pdf.toString('latin1')).toContain('%%EOF')
    // Non-trivial content: header band, table, watermark, fonts.
    expect(pdf.length).toBeGreaterThan(1500)
  })

  it('contains the Eniac Inc. letterhead and invoice details', async () => {
    const pdf = await buildInvoicePdf(
      {
        invoice: mockInvoice(),
        clientName: 'Acme Corporation',
        sowNumber: 'SOW-2026-014',
        issuedOn: new Date('2026-04-01T10:00:00Z'),
      },
      { compress: false },
    )

    const text = decodePdfText(pdf)
    expect(text).toContain('ENIAC INC.')
    expect(text).toContain('INVOICE')
    expect(text).toContain('INV-2026-0001')
    expect(text).toContain('Acme Corporation')
    expect(text).toContain('Apollo Platform Rebuild')
    expect(text).toContain('SOW SOW-2026-014')
    expect(text).toContain('Professional services')
    expect(text).toContain('Variable cost')
    expect(text).toContain('Travel')
    expect(text).toContain('Total due (USD)')
    expect(text).toContain('$4,050.00')
    expect(text).toContain('$3,900.00')
    // Draft watermark + status line.
    expect(text).toContain('DRAFT')
    expect(text).toContain('NOT YET ISSUED')
  })

  it('marks sent invoices as issued, without the draft watermark', async () => {
    const pdf = await buildInvoicePdf(
      {
        invoice: mockInvoice({ status: 'sent', sentAt: new Date('2026-04-02T09:00:00Z') }),
        clientName: 'Acme Corporation',
        issuedOn: new Date('2026-04-02T09:00:00Z'),
      },
      { compress: false },
    )

    const text = decodePdfText(pdf)
    expect(text).toContain('ISSUED')
    expect(text).not.toContain('NOT YET ISSUED')
  })

  it('paginates long invoices and footers every page', async () => {
    const manyCosts = Array.from({ length: 60 }, (_, i) => ({
      id: `vc-${i}`,
      amount: 10 + i,
      reason: `Expense line ${i + 1}`,
    }))
    const pdf = await buildInvoicePdf(
      {
        invoice: mockInvoice({ variableCosts: manyCosts, variableCostTotal: 2160, total: 6060 }),
        clientName: 'Acme Corporation',
        issuedOn: new Date('2026-04-01T10:00:00Z'),
      },
      { compress: false },
    )

    const text = decodePdfText(pdf)
    // 1 fixed line + 60 variable lines flow onto multiple pages, each with a
    // repeated table header and a "Page X of Y" footer.
    expect(text).toContain('Page 1 of 4')
    expect(text).toContain('Page 4 of 4')
    expect(text).toContain('Expense line 60')
    expect(text).toContain('$6,060.00')
  })
})
