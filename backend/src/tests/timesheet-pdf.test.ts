/// <reference types="vitest" />

import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildTimesheetsPdf, type EmployeeTimesheetGroup } from '../services/timesheet-pdf.service.js'
import { createApp } from '../app.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'

vi.mock('../lib/mongodb.js')
vi.mock('../lib/jwt.js')

function decodePdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  const runs = [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
  return runs.join('')
}

function mockSampleGroups(): EmployeeTimesheetGroup[] {
  return [
    {
      employee: {
        id: 'user-1',
        name: 'Alice Johnson',
        email: 'alice@example.com',
        employeeId: 'EMP-001',
        department: 'Engineering',
      },
      timesheets: [
        {
          id: 'ts-1',
          weekStart: '2026-10-05',
          weekEnd: '2026-10-11',
          projectName: 'Apollo Platform',
          clientName: 'Acme Corp',
          status: 'APPROVED',
          regularHours: 40,
          overtimeHours: 5,
          totalHours: 45,
          description: '[Mon] Architecture design; [Tue] Core API implementation',
        },
        {
          id: 'ts-2',
          weekStart: '2026-09-28',
          weekEnd: '2026-10-04',
          projectName: 'Apollo Platform',
          clientName: 'Acme Corp',
          status: 'APPROVED',
          regularHours: 35,
          overtimeHours: 0,
          totalHours: 35,
          description: '[Mon] Database schema setup',
        },
      ],
      subtotalRegularHours: 75,
      subtotalOvertimeHours: 5,
      subtotalTotalHours: 80,
    },
    {
      employee: {
        id: 'user-2',
        name: 'Bob Smith',
        email: 'bob@example.com',
        employeeId: 'EMP-002',
        department: 'QA & Testing',
      },
      timesheets: [
        {
          id: 'ts-3',
          weekStart: '2026-10-05',
          weekEnd: '2026-10-11',
          projectName: 'Billing Gateway',
          clientName: 'Global Corp',
          status: 'PENDING',
          regularHours: 40,
          overtimeHours: 8,
          totalHours: 48,
          description: '[Mon-Fri] End-to-end integration tests; [Sat] Release audit',
        },
      ],
      subtotalRegularHours: 40,
      subtotalOvertimeHours: 8,
      subtotalTotalHours: 48,
    },
  ]
}

describe('timesheets PDF builder', () => {
  it('renders a valid PDF document with employee groups and combined totals', async () => {
    const groups = mockSampleGroups()
    const pdf = await buildTimesheetsPdf({
      companyName: 'Eniac Inc.',
      issuedOn: new Date('2026-10-06T10:00:00Z'),
      adminName: 'Super Admin',
      filterSummary: 'All Personnel & Projects',
      groups,
      totalCombinedRegularHours: 115,
      totalCombinedOvertimeHours: 13,
      totalCombinedHours: 128,
      totalTimesheetsCount: 3,
      totalEmployeesCount: 2,
    })

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(pdf.toString('latin1')).toContain('%%EOF')
    expect(pdf.length).toBeGreaterThan(1500)
  })

  it('contains the masthead, employee timesheet lines, subtotals, and grand total at the end', async () => {
    const groups = mockSampleGroups()
    const pdf = await buildTimesheetsPdf(
      {
        companyName: 'Eniac Inc.',
        issuedOn: new Date('2026-10-06T10:00:00Z'),
        adminName: 'Super Admin',
        filterSummary: 'All Personnel & Projects',
        groups,
        totalCombinedRegularHours: 115,
        totalCombinedOvertimeHours: 13,
        totalCombinedHours: 128,
        totalTimesheetsCount: 3,
        totalEmployeesCount: 2,
      },
      { compress: false },
    )

    const text = decodePdfText(pdf)

    // Letterhead & title
    expect(text).toContain('ENIAC INC.')
    expect(text).toContain('STATEMENT OF TIMESHEET')
    expect(text).toContain('RECORDS')

    // Employees info
    expect(text).toContain('ALICE JOHNSON')
    expect(text).toContain('alice@example.com')
    expect(text).toContain('BOB SMITH')
    expect(text).toContain('bob@example.com')

    // Projects and deliverables
    expect(text).toContain('Apollo Platform')
    expect(text).toContain('Billing Gateway')
    expect(text).toContain('Architecture design')

    // Subtotals per employee
    expect(text).toContain('SUBTOTAL FOR ALICE JOHNSON')
    expect(text).toContain('SUBTOTAL FOR BOB SMITH')

    // Combined summary at the end
    expect(text).toContain('COMBINED HOURS SUMMARY')
    expect(text).toContain('TOTAL COMBINED HOURS')
    expect(text).toContain('128.00 HRS')

    // Footers
    expect(text).toContain('Page 1 of')
  })

  it('paginates gracefully when there are many employees and timesheets', async () => {
    const manyGroups: EmployeeTimesheetGroup[] = Array.from({ length: 15 }, (_, i) => ({
      employee: {
        id: `user-${i}`,
        name: `Employee ${String.fromCharCode(65 + (i % 26))} Number ${i + 1}`,
        email: `emp${i}@example.com`,
        employeeId: `EMP-${100 + i}`,
        department: 'Operations',
      },
      timesheets: Array.from({ length: 3 }, (_, j) => ({
        id: `ts-${i}-${j}`,
        weekStart: `2026-0${1 + j}-05`,
        weekEnd: `2026-0${1 + j}-11`,
        projectName: `Project ${i + 1}`,
        clientName: `Client ${i + 1}`,
        status: 'APPROVED',
        regularHours: 40,
        overtimeHours: 2,
        totalHours: 42,
        description: `Deliverable task notes for batch item ${i}-${j}`,
      })),
      subtotalRegularHours: 120,
      subtotalOvertimeHours: 6,
      subtotalTotalHours: 126,
    }))

    const pdf = await buildTimesheetsPdf(
      {
        companyName: 'Eniac Inc.',
        issuedOn: new Date('2026-10-06T10:00:00Z'),
        groups: manyGroups,
        totalCombinedRegularHours: 1800,
        totalCombinedOvertimeHours: 90,
        totalCombinedHours: 1890,
        totalTimesheetsCount: 45,
        totalEmployeesCount: 15,
      },
      { compress: false },
    )

    const text = decodePdfText(pdf)
    expect(text).toContain('Page 1 of')
    expect(text).toContain('TOTAL COMBINED HOURS')
    expect(text).toContain('1890.00 HRS')
  })
})

describe('GET /api/v1/timesheets/export/pdf HTTP endpoint', () => {
  let app: any

  const adminUser = {
    _id: new ObjectId('507f1f77bcf86cd799439011'),
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    isSupervisor: false,
    status: 'active',
  }

  const regularUser = {
    _id: new ObjectId('507f1f77bcf86cd799439022'),
    name: 'Normal User',
    email: 'normal@example.com',
    role: 'user',
    isSupervisor: false,
    status: 'active',
  }

  const project = {
    _id: new ObjectId('507f1f77bcf86cd799439033'),
    name: 'Apollo Project',
    client: 'Acme Corp',
    teamMemberIds: [regularUser._id],
    supervisorId: adminUser._id,
  }

  const sampleTimesheet = {
    _id: new ObjectId('507f1f77bcf86cd799439044'),
    userId: regularUser._id,
    projectId: project._id,
    weekStart: '2026-10-05',
    entries: [
      {
        id: 'e-1',
        description: 'Worked on dashboard',
        entryType: 'regular',
        hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8, sat: 0, sun: 0 },
      },
    ],
    notes: 'Good progress',
    regularHours: 40,
    overtimeHours: 0,
    totalHours: 40,
    status: 'approved',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const { verifyAccessToken } = await import('../lib/jwt.js')
    vi.mocked(verifyAccessToken).mockImplementation(async (token: string) => {
      if (token === 'admin-token') {
        return { userId: adminUser._id.toString(), role: 'admin' } as any
      }
      if (token === 'user-token') {
        return { userId: regularUser._id.toString(), role: 'user' } as any
      }
      return null
    })

    const mockDb = {
      collection: (name: string) => {
        if (name === COLLECTIONS.USERS) {
          return {
            findOne: vi.fn(async (q: any) => {
              if (q._id?.toString() === adminUser._id.toString()) return adminUser
              if (q._id?.toString() === regularUser._id.toString()) return regularUser
              return null
            }),
            find: vi.fn(() => ({
              toArray: vi.fn(async () => [adminUser, regularUser]),
            })),
          }
        }
        if (name === COLLECTIONS.PROJECTS) {
          return {
            find: vi.fn(() => ({
              toArray: vi.fn(async () => [project]),
            })),
          }
        }
        if (name === COLLECTIONS.TIMESHEETS) {
          return {
            find: vi.fn(() => ({
              toArray: vi.fn(async () => [sampleTimesheet]),
            })),
          }
        }
        if (name === COLLECTIONS.SETTINGS) {
          return {
            findOne: vi.fn(async () => ({
              companyName: 'Eniac Inc.',
              standardWeeklyHours: 40,
            })),
          }
        }
        return {
          findOne: vi.fn(async () => null),
          find: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
        }
      },
    }

    vi.mocked(getDb).mockResolvedValue(mockDb as any)
    app = createApp()
  })

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/timesheets/export/pdf')
    expect(res.status).toBe(401)
  })

  it('rejects regular non-admin users with 403', async () => {
    const res = await request(app)
      .get('/api/v1/timesheets/export/pdf')
      .set('Authorization', 'Bearer user-token')

    expect(res.status).toBe(403)
  })

  it('serves the timesheet report PDF to admins with 200 and attachment header', async () => {
    const res = await request(app)
      .get('/api/v1/timesheets/export/pdf')
      .set('Authorization', 'Bearer admin-token')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toContain('attachment; filename="timesheet-report-')
    expect(res.body.length).toBeGreaterThan(1000)
    expect(res.body.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })
})
