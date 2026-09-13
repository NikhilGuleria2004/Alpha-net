import 'dotenv/config'
import { getDb } from '../lib/mongodb.js'
import { hashPassword } from '../services/auth.service.js'
import { logger } from '../lib/logger.js'
import { ObjectId } from 'mongodb'

const SUPERVISOR_EMAIL = 'raj@eniac.demo'
const USER_EMAIL = 'alex@eniac.demo'
const ADMIN_EMAIL = 'nikhil@eniac.demo'

interface DemoUser {
  name: string
  email: string
  employeeId: string
  department: string
  role: 'admin' | 'user'
  isSupervisor: boolean
  status: 'active' | 'inactive'
  passwordHash: string
  supervisorId: ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const demoUsers: DemoUser[] = [
  {
    name: 'Admin Demo',
    email: ADMIN_EMAIL,
    employeeId: 'ADMIN-001',
    department: 'Engineering',
    role: 'admin' as const,
    isSupervisor: false,
    status: 'active' as const,
    passwordHash: '',
    supervisorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: 'User Demo',
    email: USER_EMAIL,
    employeeId: 'USER-001',
    department: 'Design',
    role: 'user' as const,
    isSupervisor: false,
    status: 'active' as const,
    passwordHash: '',
    supervisorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: 'Supervisor Demo',
    email: SUPERVISOR_EMAIL,
    employeeId: 'SUP-001',
    department: 'Engineering',
    role: 'user' as const,
    isSupervisor: true,
    status: 'active' as const,
    passwordHash: '',
    supervisorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

async function seed() {
  try {
    const db = await getDb()
    const users = db.collection('users')

    const supervisor = demoUsers.find((u) => u.email === SUPERVISOR_EMAIL)!
    supervisor.passwordHash = await hashPassword('Password123!')
    await users.updateOne(
      { email: supervisor.email },
      { $set: supervisor },
      { upsert: true }
    )
    logger.info({ email: supervisor.email }, 'seeded demo supervisor')

    const supervisorDoc = await users.findOne({ email: SUPERVISOR_EMAIL })
    if (!supervisorDoc) {
      throw new Error('Failed to find seeded supervisor')
    }
    const supervisorId = supervisorDoc._id

    const user = demoUsers.find((u) => u.email === USER_EMAIL)!
    user.passwordHash = await hashPassword('Password123!')
    user.supervisorId = supervisorId
    await users.updateOne(
      { email: user.email },
      { $set: user },
      { upsert: true }
    )
    logger.info({ email: user.email, supervisorId: supervisorId.toString() }, 'seeded demo user')

    const userIdDoc = await users.findOne({ email: USER_EMAIL })

    const admin = demoUsers.find((u) => u.email === ADMIN_EMAIL)!
    admin.passwordHash = await hashPassword('Password123!')
    await users.updateOne(
      { email: admin.email },
      { $set: admin },
      { upsert: true }
    )
    logger.info({ email: admin.email }, 'seeded demo admin')

    const adminDoc = await users.findOne({ email: ADMIN_EMAIL })

    await seedProjectAndTimesheet(db, adminDoc!._id, supervisorId, userIdDoc!._id)

    logger.info('demo data seeded successfully')
    process.exit(0)
  } catch (err) {
    logger.error({ err }, 'failed to seed demo users')
    process.exit(1)
  }
}

interface TimesheetEntry {
  id: string
  description: string
  entryType: 'regular' | 'overtime'
  hours: Record<string, number>
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  return d
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calcTotals(entries: TimesheetEntry[]): { regularHours: number; overtimeHours: number; totalHours: number } {
  let regularHours = 0
  let overtimeHours = 0
  for (const entry of entries) {
    if (entry.entryType === 'regular') {
      regularHours += entry.hours.mon + entry.hours.tue + entry.hours.wed + entry.hours.thu + entry.hours.fri
    } else {
      overtimeHours += entry.hours.sat + entry.hours.sun
    }
  }
  return { regularHours, overtimeHours, totalHours: regularHours + overtimeHours }
}

async function seedProjectAndTimesheet(
  db: any,
  adminId: ObjectId,
  supervisorId: ObjectId,
  userId: ObjectId
) {
  const projects = db.collection('projects')
  const timesheets = db.collection('timesheets')

  const weekStart = toLocalDateString(getMonday(new Date()))
  const submittedAt = new Date(weekStart + 'T17:00:00Z')

  await projects.updateOne(
    { sowNumber: 'DEMO-SOW-001' },
    {
      $setOnInsert: {
        name: 'Demo Project',
        sowNumber: 'DEMO-SOW-001',
        client: 'Demo Client',
        description: 'A demo project for the supervisor dashboard.',
        startDate: '2026-09-01',
        endDate: '2026-12-31',
        deadline: '2026-12-31',
        status: 'active',
        managerId: adminId,
        supervisorId: supervisorId,
        teamMemberIds: [userId],
        documentIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  )
  logger.info({ sowNumber: 'DEMO-SOW-001' }, 'seeded demo project')

  const project = await projects.findOne({ sowNumber: 'DEMO-SOW-001' })
  if (!project) {
    throw new Error('Failed to find seeded project')
  }

  const entries: TimesheetEntry[] = [
    {
      id: 'entry-demo-1',
      description: 'Frontend development and component implementation',
      entryType: 'regular',
      hours: { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6, sat: 0, sun: 0 },
    },
  ]
  const totals = calcTotals(entries)

  await timesheets.updateOne(
    { userId, projectId: project._id, weekStart },
    {
      $setOnInsert: {
        userId,
        projectId: project._id,
        weekStart,
        entries,
        notes: 'Completed homepage and dashboard components.',
        regularHours: totals.regularHours,
        overtimeHours: totals.overtimeHours,
        totalHours: totals.totalHours,
        status: 'pending',
        submittedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  )
  logger.info({ userId: USER_EMAIL, projectId: project._id.toString() }, 'seeded demo pending timesheet')
}

seed()
