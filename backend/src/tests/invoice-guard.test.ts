/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { COLLECTIONS } from '../lib/collections.js'
import { getDb } from '../lib/mongodb.js'

vi.mock('../lib/mongodb.js')
vi.mock('../services/activity.service.js', () => ({
  createActivity: vi.fn(),
}))

function mockProject(hourlyRate: number) {
  return {
    _id: new ObjectId(),
    name: 'Test Project',
    hourlyRate,
    status: 'active',
    managerId: new ObjectId(),
    supervisorId: null,
    teamMemberIds: [],
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    deadline: '2024-12-31',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function mockTimesheet(weekStart: string, entries: { entryType: string; hours: Record<string, number> }[]) {
  return {
    _id: new ObjectId(),
    userId: new ObjectId(),
    projectId: new ObjectId(),
    weekStart,
    entries,
    notes: '',
    regularHours: entries.reduce((sum, e) => sum + Object.values(e.hours).reduce((s, h) => s + h, 0), 0),
    overtimeHours: 0,
    totalHours: entries.reduce((sum, e) => sum + Object.values(e.hours).reduce((s, h) => s + h, 0), 0),
    status: 'submitted',
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function createCollectionMock(items: Record<string, unknown>[] = []) {
  let stored = [...items]
  return {
    find: vi.fn(() => ({
      toArray: vi.fn(() => Promise.resolve([...stored])),
      sort: vi.fn(() => ({ toArray: vi.fn(() => Promise.resolve([...stored])) })),
    })),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    insertOne: vi.fn((doc: Record<string, unknown>) => {
      const inserted = { _id: new ObjectId(), ...doc }
      stored.push(inserted)
      return Promise.resolve({ insertedId: inserted._id })
    }),
    updateOne: vi.fn(),
    deleteOne: vi.fn(() => Promise.resolve({ deletedCount: 1 })),
  }
}

const ADMIN_ID = '507f1f77bcf86cd799439011'

describe('invoice guard tests', () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReset()
  })

  describe('(a) fixed-cost = billable hours × rate', () => {
    it('fixed cost is billable (regular) hours × project hourly rate', async () => {
      const project = mockProject(50)
      const timesheets = [
        mockTimesheet('2024-01-01', [
          { entryType: 'regular', hours: { mon: 8, tue: 8, wed: 0, thu: 0, fri: 0 } },
        ]),
      ]
      const projectId = project._id.toString()
      const invoices = createCollectionMock()
      const counters = createCollectionMock()
      counters.insertOne.mockResolvedValue({ insertedId: new ObjectId() })

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.PROJECTS) {
            const col = createCollectionMock([project])
            col.findOne.mockResolvedValue(project)
            return col
          }
          if (name === COLLECTIONS.TIMESHEETS) return createCollectionMock(timesheets as Record<string, unknown>[])
          if (name === COLLECTIONS.INVOICES) return invoices
          if (name === COLLECTIONS.INVOICE_COUNTERS) return counters
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId,
        weekStart: '2024-01-01',
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.fixedCost).toBe(800)
      expect(invoice.hourlyRate).toBe(50)
      expect(invoice.total).toBe(800)
    })

    it('fixed cost is zero when no regular hours exist', async () => {
      const project = mockProject(75)
      const timesheets = [
        mockTimesheet('2024-01-01', [
          { entryType: 'overtime', hours: { mon: 4, tue: 4, wed: 4, thu: 4, fri: 4 } },
        ]),
      ]
      const projectId = project._id.toString()
      const invoices = createCollectionMock()
      const counters = createCollectionMock()
      counters.insertOne.mockResolvedValue({ insertedId: new ObjectId() })

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.PROJECTS) {
            const col = createCollectionMock([project])
            col.findOne.mockResolvedValue(project)
            return col
          }
          if (name === COLLECTIONS.TIMESHEETS) return createCollectionMock(timesheets as Record<string, unknown>[])
          if (name === COLLECTIONS.INVOICES) return invoices
          if (name === COLLECTIONS.INVOICE_COUNTERS) return counters
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId,
        weekStart: '2024-01-01',
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      expect(invoice.fixedCost).toBe(0)
      expect(invoice.total).toBe(0)
    })
  })

  describe('(a2) project-total billing', () => {
    it('fixed cost sums regular hours across ALL weeks and uses the override rate', async () => {
      const project = mockProject(50)
      const timesheets = [
        mockTimesheet('2024-01-01', [
          { entryType: 'regular', hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 } },
        ]),
        mockTimesheet('2024-01-08', [
          { entryType: 'regular', hours: { mon: 4, tue: 4, wed: 4, thu: 0, fri: 0 } },
        ]),
        mockTimesheet('2024-01-15', [
          { entryType: 'overtime', hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 } },
        ]),
      ]
      const projectId = project._id.toString()
      const invoices = createCollectionMock()
      const counters = createCollectionMock()
      counters.insertOne.mockResolvedValue({ insertedId: new ObjectId() })

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.PROJECTS) {
            const col = createCollectionMock([project])
            col.findOne.mockResolvedValue(project)
            return col
          }
          if (name === COLLECTIONS.TIMESHEETS) return createCollectionMock(timesheets as Record<string, unknown>[])
          if (name === COLLECTIONS.INVOICES) return invoices
          if (name === COLLECTIONS.INVOICE_COUNTERS) return counters
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { createInvoice } = await import('../services/invoice.service.js')
      const invoice = await createInvoice({
        projectId,
        hourlyRate: 75,
        adminUserId: ADMIN_ID,
        adminUserName: 'Admin User',
      })

      // 40h + 12h regular across weeks; overtime (40h) excluded.
      expect(invoice.billableHours).toBe(52)
      // Override rate (75), not the project default (50).
      expect(invoice.hourlyRate).toBe(75)
      expect(invoice.fixedCost).toBe(3900)
      expect(invoice.total).toBe(3900)
      // Billing period spans the first → last logged week.
      expect(invoice.weekStart).toBe('2024-01-01')
      expect(invoice.weekEnd).toBe('2024-01-21')
    })

    it('blocks a second invoice while a draft is open for the project', async () => {
      const project = mockProject(50)
      const invoices = createCollectionMock()
      invoices.findOne.mockResolvedValue({ _id: new ObjectId(), status: 'draft' })
      const counters = createCollectionMock()

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.PROJECTS) {
            const col = createCollectionMock([project])
            col.findOne.mockResolvedValue(project)
            return col
          }
          if (name === COLLECTIONS.TIMESHEETS) return createCollectionMock()
          if (name === COLLECTIONS.INVOICES) return invoices
          if (name === COLLECTIONS.INVOICE_COUNTERS) return counters
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { createInvoice } = await import('../services/invoice.service.js')
      await expect(
        createInvoice({
          projectId: project._id.toString(),
          adminUserId: ADMIN_ID,
          adminUserName: 'Admin User',
        }),
      ).rejects.toThrow('open draft invoice already exists')
    })
  })

  describe('(b) total recomputes on variable-cost add/remove', () => {
    it('total increases by variable cost amount when adding costs', async () => {
      const project = mockProject(50)
      const timesheets = [
        mockTimesheet('2024-01-01', [
          { entryType: 'regular', hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 } },
        ]),
      ]
      const invoiceId = new ObjectId().toString()
      const invoices = createCollectionMock()
      invoices.findOne.mockResolvedValueOnce(invoiceDoc(invoiceId, 2000))
      const updatedDoc = invoiceDoc(invoiceId, 2000, [{ id: 'c1', amount: 150, reason: 'Travel' }])
      invoices.findOneAndUpdate.mockResolvedValue(updatedDoc)
      invoices.findOne.mockResolvedValue(updatedDoc)

      const counters = createCollectionMock()

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.PROJECTS) {
            const col = createCollectionMock([project])
            col.findOne.mockResolvedValue(project)
            return col
          }
          if (name === COLLECTIONS.TIMESHEETS) return createCollectionMock(timesheets as Record<string, unknown>[])
          if (name === COLLECTIONS.INVOICES) return invoices
          if (name === COLLECTIONS.INVOICE_COUNTERS) return counters
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { addVariableCosts } = await import('../services/invoice.service.js')
      const result = await addVariableCosts(invoiceId, [{ amount: 150, reason: 'Travel' }], ADMIN_ID)

      expect(result.variableCostTotal).toBe(150)
      expect(result.total).toBe(2150)
    })

    it('total decreases when variable costs are removed', async () => {
      const project = mockProject(50)
      const timesheets = [
        mockTimesheet('2024-01-01', [
          { entryType: 'regular', hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 } },
        ]),
      ]
      const invoiceId = new ObjectId().toString()
      const cost1Id = new ObjectId().toString()
      const cost2Id = new ObjectId().toString()
      const invoices = createCollectionMock()
      invoices.findOne.mockResolvedValueOnce(invoiceDoc(invoiceId, 2000, [
        { id: cost1Id, amount: 150, reason: 'Travel' },
        { id: cost2Id, amount: 50, reason: 'Meals' },
      ]))
      const afterRemove = invoiceDoc(invoiceId, 2000, [
        { id: cost2Id, amount: 50, reason: 'Meals' },
      ])
      invoices.findOneAndUpdate.mockResolvedValue(afterRemove)
      invoices.findOne.mockResolvedValue(afterRemove)

      const counters = createCollectionMock()

      const db = {
        collection: vi.fn((name: string) => {
          if (name === COLLECTIONS.PROJECTS) {
            const col = createCollectionMock([project])
            col.findOne.mockResolvedValue(project)
            return col
          }
          if (name === COLLECTIONS.TIMESHEETS) return createCollectionMock(timesheets as Record<string, unknown>[])
          if (name === COLLECTIONS.INVOICES) return invoices
          if (name === COLLECTIONS.INVOICE_COUNTERS) return counters
          return createCollectionMock()
        }),
      }
      vi.mocked(getDb).mockResolvedValue(db as never)

      const { removeVariableCosts } = await import('../services/invoice.service.js')
      const result = await removeVariableCosts(invoiceId, [cost1Id], ADMIN_ID)

      expect(result.variableCostTotal).toBe(50)
      expect(result.total).toBe(2050)
    })
  })
})

function invoiceDoc(invoiceId: string, fixedCost: number, variableCosts: { id: string; amount: number; reason: string }[] = []): Record<string, unknown> {
  const variableCostTotal = variableCosts.reduce((sum, vc) => sum + vc.amount, 0)
  return {
    _id: new ObjectId(invoiceId),
    invoiceNumber: 'INV-2024-0001',
    projectId: new ObjectId(),
    projectName: 'Test Project',
    weekStart: '2024-01-01',
    weekEnd: '2024-01-07',
    periodLabel: '2024-W01 (Jan 1 – Jan 7)',
    hourlyRate: 50,
    fixedCost,
    variableCosts,
    variableCostTotal,
    total: fixedCost + variableCostTotal,
    status: 'draft',
    createdBy: new ObjectId(ADMIN_ID),
    createdByName: 'Admin User',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
