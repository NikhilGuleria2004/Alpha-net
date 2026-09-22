import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { logger } from '../lib/logger.js'
import { createActivity } from './activity.service.js'
import { getProjectById } from './project.service.js'
import { normalizeToMonday } from './timesheet.service.js'
import { sendInvoiceEmail } from '../lib/email.js'
import { buildInvoicePdf } from './invoice-pdf.service.js'
import type { VariableCostInput } from '../schemas/invoice.schema.js'

export type InvoiceStatus = 'draft' | 'sent'

export interface VariableCost {
  id: string
  amount: number
  reason: string
}

export interface Invoice {
  id: string
  invoiceNumber: string
  projectId: string
  projectName: string
  weekStart: string
  weekEnd: string
  periodLabel: string
  hourlyRate: number
  billableHours?: number
  fixedCost: number
  variableCosts: VariableCost[]
  variableCostTotal: number
  total: number
  status: InvoiceStatus
  createdBy: string
  createdByName: string
  createdAt: Date
  updatedAt: Date
  sentAt?: Date
  pdfPath?: string
}

function weekEndFromStart(weekStart: string): string {
  const date = new Date(weekStart + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 6)
  return date.toISOString().split('T')[0]
}

function buildPeriodLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const monthDay = (d: Date) =>
    d.toLocaleDateString('en-US', opts).replace(',', '')
  const year = start.getUTCFullYear()
  const weekNum = Math.ceil(
    (start.getUTCDate() + 6 - start.getUTCDay()) / 7,
  )
  return `${year}-W${String(weekNum).padStart(2, '0')} (${monthDay(start)} – ${monthDay(end)})`
}

/**
 * Label for a project-total invoice: the span between the first and last
 * logged week, e.g. "All logged time · Jan 6 – Mar 21, 2025". Falls back to
 * the week label when the span is a single week.
 */
function buildSpanPeriodLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(weekEnd + 'T00:00:00Z')
  const monthDay = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(',', '')
  if (weekEndFromStart(weekStart) === weekEnd) {
    return buildPeriodLabel(weekStart)
  }
  return `All logged time · ${monthDay(start)} – ${monthDay(end)}, ${end.getUTCFullYear()}`
}

/** Current week's Monday (UTC) — fallback billing period for projects with no timesheets. */
function currentMonday(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
  now.setUTCDate(diff)
  now.setUTCHours(0, 0, 0, 0)
  return now.toISOString().split('T')[0]
}

async function nextInvoiceNumber(): Promise<string> {
  const db = await getDb()
  const result = await db
    .collection(COLLECTIONS.INVOICE_COUNTERS)
    .findOneAndUpdate(
      { key: 'invoice' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    )
  const seq = result?.seq ?? 1
  const year = new Date().getUTCFullYear()
  return `INV-${year}-${String(seq).padStart(4, '0')}`
}

function toInvoice(doc: any): Invoice {
  const variableCosts: VariableCost[] = (doc.variableCosts ?? []).map(
    (vc: any) => ({
      id: vc._id?.toString() ?? vc.id ?? '',
      amount: vc.amount,
      reason: vc.reason,
    }),
  )
  const variableCostTotal = variableCosts.reduce((sum, vc) => sum + vc.amount, 0)
  return {
    id: doc._id.toString(),
    invoiceNumber: doc.invoiceNumber,
    projectId: doc.projectId.toString(),
    projectName: doc.projectName,
    weekStart: doc.weekStart,
    weekEnd: doc.weekEnd,
    periodLabel: doc.periodLabel,
    hourlyRate: doc.hourlyRate,
    billableHours: doc.billableHours,
    fixedCost: doc.fixedCost,
    variableCosts,
    variableCostTotal: doc.variableCostTotal ?? variableCostTotal,
    total: doc.total,
    status: doc.status,
    createdBy: doc.createdBy.toString(),
    createdByName: doc.createdByName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sentAt: doc.sentAt,
    pdfPath: doc.pdfPath,
  }
}

export async function createInvoice(input: {
  projectId: string
  /** Legacy/optional: only used as the fallback period when the project has no timesheets. */
  weekStart?: string
  /** Optional override of the project's default hourly rate. */
  hourlyRate?: number
  adminUserId: string
  adminUserName: string
}): Promise<Invoice> {
  const db = await getDb()
  const adminId = new ObjectId(input.adminUserId)

  // 1. Validate project + rate. The admin may override the project's default
  // rate; otherwise the project's own rate applies.
  const project = await getProjectById(input.projectId)
  if (!project) {
    throw new Error('Project not found')
  }
  const hourlyRate = input.hourlyRate ?? project.hourlyRate
  if (hourlyRate == null) {
    throw new Error(
      'Cannot create invoice: project has no hourly rate set and none was provided',
    )
  }

  // 2. Compute fixed cost from the project's TOTAL logged hours: every
  // timesheet (all team members, all weeks) on the project. Billable =
  // regular Mon–Fri hours; overtime excluded.
  const timesheets = await db
    .collection(COLLECTIONS.TIMESHEETS)
    .find({
      projectId: new ObjectId(input.projectId),
    })
    .toArray()

  let billableHours = 0
  for (const ts of timesheets) {
    for (const entry of ts.entries ?? []) {
      if (entry.entryType === 'regular') {
        for (const day of ['mon', 'tue', 'wed', 'thu', 'fri']) {
          billableHours += (entry.hours?.[day] as number) ?? 0
        }
      }
    }
  }
  const fixedCost = billableHours * hourlyRate

  // 3. Billing period covers the whole logged span: first logged week → last
  // logged week. Falls back to the caller's weekStart, then to the current
  // week, when the project has no timesheets yet.
  const loggedWeeks = timesheets
    .map((ts) => ts.weekStart as string)
    .filter(Boolean)
    .sort()
  const weekStart = loggedWeeks[0] ?? (input.weekStart ? normalizeToMonday(input.weekStart) : currentMonday())
  const lastWeek = loggedWeeks[loggedWeeks.length - 1] ?? weekStart
  const weekEnd = weekEndFromStart(lastWeek)

  // 4. One open draft per project — the draft already covers all logged time,
  // so a second concurrent draft would double-bill.
  const existing = await db
    .collection(COLLECTIONS.INVOICES)
    .findOne({ projectId: new ObjectId(input.projectId), status: 'draft' })
  if (existing) {
    throw new Error(
      'An open draft invoice already exists for this project — send it before creating a new one',
    )
  }

  // 5. Generate invoice number
  const invoiceNumber = await nextInvoiceNumber()
  const periodLabel = buildSpanPeriodLabel(weekStart, weekEnd)
  const now = new Date()

  const doc: Record<string, any> = {
    invoiceNumber,
    projectId: new ObjectId(input.projectId),
    projectName: project.name,
    weekStart,
    weekEnd,
    periodLabel,
    hourlyRate,
    billableHours,
    fixedCost,
    variableCosts: [],
    variableCostTotal: 0,
    total: fixedCost,
    status: 'draft',
    createdBy: adminId,
    createdByName: input.adminUserName,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection(COLLECTIONS.INVOICES).insertOne(doc)
  const invoice = toInvoice({ ...doc, _id: result.insertedId })

  await createActivity({
    userId: input.adminUserId,
    projectId: input.projectId,
    description: `Invoice ${invoice.invoiceNumber} created for ${project.name} (week of ${weekStart}).`,
  })

  return invoice
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const db = await getDb()
  const invoice = await db
    .collection(COLLECTIONS.INVOICES)
    .findOne({ _id: new ObjectId(id) })
  if (!invoice) return null
  return toInvoice(invoice)
}

export async function listProjectInvoices(
  projectId: string,
  filters?: { status?: InvoiceStatus; from?: string; to?: string },
): Promise<Invoice[]> {
  const db = await getDb()
  const query: Record<string, unknown> = {}
  if (projectId) {
    query.projectId = new ObjectId(projectId)
  }
  if (filters?.status) query.status = filters.status
  if (filters?.from || filters?.to) {
    const weekStartQuery: Record<string, unknown> = {}
    if (filters.from) weekStartQuery.$gte = filters.from
    if (filters.to) weekStartQuery.$lte = filters.to
    query.weekStart = weekStartQuery
  }
  const invoices = await db
    .collection(COLLECTIONS.INVOICES)
    .find(query)
    .sort({ createdAt: -1 })
    .toArray()
  return invoices.map(toInvoice)
}

export async function addVariableCosts(
  invoiceId: string,
  items: VariableCostInput[],
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'draft') {
    throw new Error('Cannot modify a sent invoice')
  }

  const costs = items.map((item) => ({
    amount: item.amount,
    reason: item.reason,
  }))

  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $push: {
          variableCosts: { $each: costs },
        } as any,
        $set: { updatedAt: new Date() },
      } as any,
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  const updated = toInvoice(result)
  const newVariableCostTotal = updated.variableCosts.reduce((s, v) => s + v.amount, 0)
  const newTotal = updated.fixedCost + newVariableCostTotal
  await db.collection(COLLECTIONS.INVOICES).updateOne(
    { _id: new ObjectId(invoiceId) },
    { $set: { variableCostTotal: newVariableCostTotal, total: newTotal, updatedAt: new Date() } },
  )

  const final = toInvoice(
    await db.collection(COLLECTIONS.INVOICES).findOne({ _id: new ObjectId(invoiceId) }),
  )

  await createActivity({
    userId: adminUserId,
    projectId: invoiceId,
    description: `Variable costs added to invoice ${invoice.invoiceNumber}.`,
  })

  return final
}

/**
 * Updates the hourly rate on a DRAFT invoice and recomputes fixed cost =
 * billable hours × new rate. The billed hours never change here — only the
 * price per hour.
 */
export async function updateInvoiceRate(
  invoiceId: string,
  hourlyRate: number,
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'draft') {
    throw new Error('Cannot modify a sent invoice')
  }

  const billableHours = invoice.billableHours ?? 0
  const fixedCost = billableHours * hourlyRate

  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $set: {
          hourlyRate,
          fixedCost,
          total: fixedCost + invoice.variableCostTotal,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  await createActivity({
    userId: adminUserId,
    projectId: invoice.projectId,
    timesheetId: invoiceId,
    description: `Hourly rate updated to $${hourlyRate.toFixed(2)} on invoice ${invoice.invoiceNumber}.`,
  })

  return toInvoice(result)
}

export async function removeVariableCosts(
  invoiceId: string,
  costIds: string[],
  adminUserId: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'draft') {
    throw new Error('Cannot modify a sent invoice')
  }

  const objectIds = costIds.map((id) => {
    try {
      return new ObjectId(id)
    } catch {
      throw new Error(`Invalid variable cost ID: ${id}`)
    }
  })

  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $pull: {
          variableCosts: { _id: { $in: objectIds } },
        } as any,
        $set: { updatedAt: new Date() },
      } as any,
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  const updated = toInvoice(result)
  await db.collection(COLLECTIONS.INVOICES).updateOne(
    { _id: new ObjectId(invoiceId) },
    {
      $set: {
        variableCostTotal: updated.variableCostTotal,
        total: updated.fixedCost + updated.variableCostTotal,
        updatedAt: new Date(),
      },
    },
  )

  const final = toInvoice(
    await db.collection(COLLECTIONS.INVOICES).findOne({ _id: new ObjectId(invoiceId) }),
  )

  await createActivity({
    userId: adminUserId,
    projectId: invoiceId,
    description: `Variable costs removed from invoice ${invoice.invoiceNumber}.`,
  })

  return final
}

export async function sendInvoice(
  invoiceId: string,
  adminUserId: string,
  recipientEmail?: string,
): Promise<Invoice> {
  const db = await getDb()
  const invoice = await getInvoice(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'draft') {
    throw new Error('Invoice is already sent')
  }

  const now = new Date()
  const result = await db
    .collection(COLLECTIONS.INVOICES)
    .findOneAndUpdate(
      { _id: new ObjectId(invoiceId), status: 'draft' },
      {
        $set: {
          status: 'sent',
          sentAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    )
  if (!result) throw new Error('Invoice not found or already sent')

  const sent = toInvoice(result)

  await createActivity({
    userId: adminUserId,
    projectId: invoice.projectId,
    timesheetId: invoiceId,
    description: `Invoice ${sent.invoiceNumber} sent for ${sent.projectName}.`,
  })

  // Best-effort delivery: if a recipient email was supplied (or the project
  // has a client email on file), attach the rendered PDF and send it. Sending
  // must never roll back the status change.
  const to = recipientEmail?.trim() || (await resolveInvoiceRecipient(sent.projectId))
  if (to) {
    try {
      const project = await getProjectById(sent.projectId)
      const pdf = await buildInvoicePdf({
        invoice: sent,
        clientName: project?.client ?? undefined,
        sowNumber: project?.sowNumber ?? undefined,
        issuedOn: now,
      })
      await sendInvoiceEmail(to, sent.invoiceNumber, sent.projectName, pdf, `${sent.invoiceNumber}.pdf`)
    } catch (err) {
      logger.warn({ err, invoiceId, to }, 'invoice email delivery failed (status already sent)')
    }
  }

  return sent
}

/**
 * Best-effort lookup of a client email for the project. The project record
 * stores a free-text client name, so this tries the users collection for a
 * matching client contact; returns undefined when nothing is found (in which
 * case the invoice is marked sent but no email goes out).
 */
async function resolveInvoiceRecipient(projectId: string): Promise<string | undefined> {
  try {
    const project = await getProjectById(projectId)
    if (!project?.client) return undefined
    const db = await getDb()
    const contact = await db
      .collection(COLLECTIONS.USERS)
      .findOne({ email: project.client.toLowerCase().trim() })
    return contact?.email ?? undefined
  } catch {
    return undefined
  }
}
