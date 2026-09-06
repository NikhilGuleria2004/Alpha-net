import 'dotenv/config'
import { getDb, closeDb } from '../lib/mongodb.js'
import { hashPassword } from '../services/auth.service.js'
import { COLLECTIONS } from '../lib/collections.js'
import { ObjectId } from 'mongodb'
import { logger } from '../lib/logger.js'

const PASSWORD = 'Password123!'

const departments = ['Engineering', 'Design', 'Marketing', 'Finance', 'Operations', 'HR', 'Sales', 'Legal']
const clients = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Corp', 'Stark Industries', 'Wayne Enterprises', 'Cyberdyne', 'Oscorp']
const projectsData = [
  { name: 'Cloud Migration', client: 'Acme Corp', sowNumber: 'SOW-2024-001', description: 'Migrate on-prem workloads to AWS.' },
  { name: 'Mobile App Redesign', client: 'Globex', sowNumber: 'SOW-2024-002', description: 'Redesign the customer-facing mobile app.' },
  { name: 'Data Analytics Platform', client: 'Initech', sowNumber: 'SOW-2024-003', description: 'Build internal analytics dashboards.' },
  { name: 'Security Hardening', client: 'Umbrella Corp', sowNumber: 'SOW-2024-004', description: 'Penetration testing and remediation.' },
  { name: 'E-commerce Integration', client: 'Stark Industries', sowNumber: 'SOW-2024-005', description: 'Integrate ERP with Shopify storefront.' },
  { name: 'Internal CRM', client: 'Wayne Enterprises', sowNumber: 'SOW-2024-006', description: 'Replace legacy CRM with custom solution.' },
  { name: 'AI Chatbot', client: 'Cyberdyne', sowNumber: 'SOW-2024-007', description: 'Deploy LLM-powered support chatbot.' },
  { name: 'Website Refresh', client: 'Oscorp', sowNumber: 'SOW-2024-008', description: 'Redesign marketing website and blog.' },
]

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

function generateEntryId(): string {
  return `entry-${Math.random().toString(36).slice(2, 9)}`
}

function createRegularEntry(description: string, days: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number }): TimesheetEntry {
  return {
    id: generateEntryId(),
    description,
    entryType: 'regular',
    hours: days,
  }
}

function createOvertimeEntry(description: string, days: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number }): TimesheetEntry {
  return {
    id: generateEntryId(),
    description,
    entryType: 'overtime',
    hours: days,
  }
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

type TimesheetEntry = {
  id: string
  description: string
  entryType: 'regular' | 'overtime'
  hours: Record<string, number>
}

type SeedUser = {
  name: string
  email: string
  employeeId: string
  department: string
  role: 'admin' | 'user'
  isSupervisor: boolean
  status: 'active' | 'inactive'
  supervisorId?: string | null
}

const admins: SeedUser[] = [
  { name: 'Nikhil Guleria', email: 'nikhil@alphanet.demo', employeeId: 'ADMIN-001', department: 'Engineering', role: 'admin', isSupervisor: false, status: 'active' },
  { name: 'Sarah Chen', email: 'sarah@alphanet.demo', employeeId: 'ADMIN-002', department: 'Operations', role: 'admin', isSupervisor: false, status: 'active' },
]

const supervisors: SeedUser[] = [
  { name: 'Raj Patel', email: 'raj@alphanet.demo', employeeId: 'SUP-001', department: 'Engineering', role: 'user', isSupervisor: true, status: 'active' },
  { name: 'Emily Watson', email: 'emily@alphanet.demo', employeeId: 'SUP-002', department: 'Design', role: 'user', isSupervisor: true, status: 'active' },
  { name: 'Michael Ross', email: 'michael@alphanet.demo', employeeId: 'SUP-003', department: 'Marketing', role: 'user', isSupervisor: true, status: 'active' },
  { name: 'Priya Sharma', email: 'priya@alphanet.demo', employeeId: 'SUP-004', department: 'Finance', role: 'user', isSupervisor: true, status: 'active' },
]

const regularUsers: SeedUser[] = [
  { name: 'Alex Johnson', email: 'alex@alphanet.demo', employeeId: 'USER-001', department: 'Engineering', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-001' },
  { name: 'Jordan Lee', email: 'jordan@alphanet.demo', employeeId: 'USER-002', department: 'Design', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-002' },
  { name: 'Taylor Smith', email: 'taylor@alphanet.demo', employeeId: 'USER-003', department: 'Marketing', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-003' },
  { name: 'Casey Brown', email: 'casey@alphanet.demo', employeeId: 'USER-004', department: 'Finance', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-004' },
  { name: 'Morgan Davis', email: 'morgan@alphanet.demo', employeeId: 'USER-005', department: 'Engineering', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-001' },
  { name: 'Riley Wilson', email: 'riley@alphanet.demo', employeeId: 'USER-006', department: 'Design', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-002' },
  { name: 'Quinn Martinez', email: 'quinn@alphanet.demo', employeeId: 'USER-007', department: 'Marketing', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-003' },
  { name: 'Avery Anderson', email: 'avery@alphanet.demo', employeeId: 'USER-008', department: 'Finance', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-004' },
  { name: 'Jamie Thomas', email: 'jamie@alphanet.demo', employeeId: 'USER-009', department: 'Engineering', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-001' },
  { name: 'Drew Jackson', email: 'drew@alphanet.demo', employeeId: 'USER-010', department: 'Design', role: 'user', isSupervisor: false, status: 'active', supervisorId: 'SUP-002' },
]

async function seedUsers() {
  const db = await getDb()
  const users = db.collection(COLLECTIONS.USERS)
  const allUsers = [...admins, ...supervisors, ...regularUsers]

  const passwordHash = await hashPassword(PASSWORD)
  const inserted = new Map<string, string>()

  for (const user of allUsers) {
    const result = await users.updateOne(
      { email: user.email },
      {
        $set: {
          name: user.name,
          email: user.email,
          employeeId: user.employeeId,
          department: user.department,
          role: user.role,
          isSupervisor: user.isSupervisor,
          status: user.status,
          passwordHash,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )

    const userId = result.upsertedId ? result.upsertedId.toString() : (await users.findOne({ email: user.email }))!._id.toString()
    inserted.set(user.employeeId, userId)
    logger.info({ email: user.email }, 'seeded user')
  }

  return inserted
}

async function seedProjects(userIds: Map<string, string>) {
  const db = await getDb()
  const projects = db.collection(COLLECTIONS.PROJECTS)
  const insertedProjectIds: string[] = []

  for (let i = 0; i < projectsData.length; i++) {
    const p = projectsData[i]
    const existing = await projects.findOne({ sowNumber: p.sowNumber })
    if (existing) {
      insertedProjectIds.push(existing._id.toString())
      continue
    }

    const managerId = userIds.get(admins[i % admins.length].employeeId)!
    const supervisorId = userIds.get(supervisors[i % supervisors.length].employeeId)!

    const startDate = randomDate(new Date(2024, 0, 1), new Date(2024, 5, 1))
    const endDate = addMonths(startDate, 6 + Math.floor(Math.random() * 6))
    const deadline = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)

    const teamSize = 3 + Math.floor(Math.random() * 4)
    const teamMembers = regularUsers.slice(0, teamSize).map((u) => userIds.get(u.employeeId)!).filter(Boolean)

    const doc: any = {
      name: p.name,
      sowNumber: p.sowNumber,
      client: p.client,
      description: p.description,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      deadline: formatDate(deadline),
      status: 'active',
      managerId: new ObjectId(managerId),
      supervisorId: new ObjectId(supervisorId),
      teamMemberIds: teamMembers.map((id) => new ObjectId(id)),
      documentIds: [],
      createdAt: startDate,
      updatedAt: startDate,
    }

    const result = await projects.insertOne(doc)
    insertedProjectIds.push(result.insertedId.toString())
    logger.info({ name: p.name }, 'seeded project')
  }

  return insertedProjectIds
}

async function seedDocuments(projectIds: string[], userIds: Map<string, string>) {
  const db = await getDb()
  const documents = db.collection(COLLECTIONS.DOCUMENTS)

  const docTemplates = [
    { name: 'Project Charter.pdf', mimeType: 'application/pdf', size: 1024 * 250 },
    { name: 'SOW Agreement.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1024 * 180 },
    { name: 'Budget.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 1024 * 120 },
    { name: 'Design Mockups.fig', mimeType: 'application/pdf', size: 1024 * 3200 },
    { name: 'Meeting Notes.txt', mimeType: 'text/plain', size: 1024 * 12 },
  ]

  for (const projectId of projectIds) {
    const count = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      const template = docTemplates[i % docTemplates.length]
      const uploader = userIds.get(admins[i % admins.length].employeeId)!
      const doc: any = {
        projectId: new ObjectId(projectId),
        name: template.name,
        size: template.size,
        mimeType: template.mimeType,
        storageKey: `projects/${projectId}/${Date.now()}-${i}`,
        url: `https://storage.example.com/projects/${projectId}/${template.name}`,
        uploadedBy: new ObjectId(uploader),
        createdAt: new Date(),
      }
      await documents.insertOne(doc)
    }
  }
}

async function seedTimesheets(projectIds: string[], userIds: Map<string, string>) {
  const db = await getDb()
  const timesheets = db.collection(COLLECTIONS.TIMESHEETS)

  const statuses: Array<'draft' | 'pending' | 'approved' | 'declined' | 'withdrawn'> = ['approved', 'approved', 'approved', 'pending', 'pending', 'declined', 'withdrawn', 'draft']
  const descriptions = [
    'Frontend development',
    'Backend API work',
    'Design review',
    'Testing and QA',
    'Documentation',
    'Client meeting',
    'Deployment',
    'Code review',
    'Sprint planning',
    'Bug fixes',
  ]

  const createdTimesheets: { id: string; userId: string; projectId: string; status: string; weekStart: string }[] = []

  for (const projectId of projectIds) {
    const projectUsers = regularUsers.slice(0, 5)
    for (const user of projectUsers) {
      const userId = userIds.get(user.employeeId)
      if (!userId) continue

      const weeksToCreate = 3 + Math.floor(Math.random() * 4)
      for (let w = 0; w < weeksToCreate; w++) {
        const baseDate = new Date()
        baseDate.setDate(baseDate.getDate() - w * 7)
        const day = baseDate.getUTCDay()
        const diff = baseDate.getUTCDate() - day + (day === 0 ? -6 : 1)
        baseDate.setUTCDate(diff)
        const weekStart = formatDate(baseDate)

        const existing = await timesheets.findOne({ userId: new ObjectId(userId), projectId: new ObjectId(projectId), weekStart })
        if (existing) continue

        const status = statuses[Math.floor(Math.random() * statuses.length)]
        const numEntries = 1 + Math.floor(Math.random() * 3)
        const entries: TimesheetEntry[] = []
        for (let e = 0; e < numEntries; e++) {
          const desc = descriptions[Math.floor(Math.random() * descriptions.length)]
          const isOvertime = Math.random() > 0.7
          if (isOvertime) {
            const sat = Math.random() > 0.5 ? Number((Math.random() * 4).toFixed(1)) : 0
            const sun = Math.random() > 0.5 ? Number((Math.random() * 4).toFixed(1)) : 0
            entries.push(createOvertimeEntry(desc, { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat, sun }))
          } else {
            const mon = Number((Math.random() * 3 + 1).toFixed(1))
            const tue = Number((Math.random() * 3 + 1).toFixed(1))
            const wed = Number((Math.random() * 3 + 1).toFixed(1))
            const thu = Number((Math.random() * 3 + 1).toFixed(1))
            const fri = Number((Math.random() * 3 + 1).toFixed(1))
            entries.push(createRegularEntry(desc, { mon, tue, wed, thu, fri, sat: 0, sun: 0 }))
          }
        }

        const totals = calcTotals(entries)
        if (totals.totalHours <= 0) continue

        const submittedAt = status === 'pending' || status === 'approved' || status === 'declined' || status === 'withdrawn' ? new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000) : undefined
        const review = status === 'approved' || status === 'declined' ? {
          reviewedBy: userIds.get(supervisors[Math.floor(Math.random() * supervisors.length)].employeeId)!,
          reviewedAt: new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          reason: status === 'declined' ? 'Incorrect hours logged on Thursday.' : undefined,
        } : undefined

        const doc: any = {
          userId: new ObjectId(userId),
          projectId: new ObjectId(projectId),
          weekStart,
          entries,
          notes: status !== 'draft' ? 'Regular weekly submission.' : '',
          regularHours: totals.regularHours,
          overtimeHours: totals.overtimeHours,
          totalHours: totals.totalHours,
          status,
          submittedAt,
          review,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        const result = await timesheets.insertOne(doc)
        createdTimesheets.push({ id: result.insertedId.toString(), userId, projectId, status, weekStart })
      }
    }
  }

  return createdTimesheets
}

async function seedNotifications(userIds: Map<string, string>, timesheets: { id: string; userId: string; projectId: string; status: string }[]) {
  const db = await getDb()
  const notifications = db.collection(COLLECTIONS.NOTIFICATIONS)

  const notificationTemplates = [
    { type: 'submission', title: 'Timesheet Submitted for Review', message: 'A timesheet has been submitted and requires your review.' },
    { type: 'approval', title: 'Timesheet Approved', message: 'Your timesheet has been approved.' },
    { type: 'decline', title: 'Timesheet Declined', message: 'Your timesheet was declined. Please review and resubmit.' },
    { type: 'withdrawal', title: 'Timesheet Withdrawn', message: 'A timesheet was withdrawn by the user.' },
    { type: 'deadline', title: 'Project Deadline Approaching', message: 'A project deadline is coming up soon.' },
    { type: 'assignment', title: 'Assigned to Project', message: 'You have been added to a new project.' },
  ]

  const users = Array.from(userIds.entries())
  for (let i = 0; i < 60; i++) {
    const [employeeId, userId] = users[Math.floor(Math.random() * users.length)]
    const template = notificationTemplates[Math.floor(Math.random() * notificationTemplates.length)]
    const related = timesheets[Math.floor(Math.random() * timesheets.length)]

    const doc: any = {
      userId: new ObjectId(userId),
      type: template.type,
      title: template.title,
      message: template.message,
      read: Math.random() > 0.3,
      relatedId: related ? new ObjectId(related.id) : null,
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)),
    }
    await notifications.insertOne(doc)
  }
}

async function seedActivities(userIds: Map<string, string>, projectIds: string[], timesheets: { id: string; userId: string; projectId: string; weekStart: string }[]) {
  const db = await getDb()
  const activities = db.collection(COLLECTIONS.ACTIVITIES)

  const activityTemplates = [
    'User created.',
    'Project created.',
    'Timesheet created for week',
    'Timesheet submitted for week',
    'Timesheet approved for week',
    'Timesheet declined for week',
    'Timesheet withdrawn for week',
    'Document uploaded.',
    'User assigned to project',
    'Supervisor assigned to project',
  ]

  const users = Array.from(userIds.entries())
  for (let i = 0; i < 120; i++) {
    const [employeeId, userId] = users[Math.floor(Math.random() * users.length)]
    const template = activityTemplates[Math.floor(Math.random() * activityTemplates.length)]
    const relatedProject = projectIds[Math.floor(Math.random() * projectIds.length)]
    const relatedTimesheet = timesheets[Math.floor(Math.random() * timesheets.length)]

    const doc: any = {
      userId: new ObjectId(userId),
      projectId: new ObjectId(relatedProject),
      timesheetId: relatedTimesheet ? new ObjectId(relatedTimesheet.id) : null,
      description: `${template}${template.includes('week') ? ' ' + relatedTimesheet?.weekStart : ''}${template.includes('project') ? ' ' + relatedProject : ''}.`,
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000)),
    }
    await activities.insertOne(doc)
  }
}

async function main() {
  try {
    logger.info('clearing existing data...')
    const db = await getDb()
    await db.collection(COLLECTIONS.ACTIVITIES).deleteMany({})
    await db.collection(COLLECTIONS.NOTIFICATIONS).deleteMany({})
    await db.collection(COLLECTIONS.DOCUMENTS).deleteMany({})
    await db.collection(COLLECTIONS.TIMESHEETS).deleteMany({})
    await db.collection(COLLECTIONS.PROJECTS).deleteMany({})
    await db.collection(COLLECTIONS.USERS).deleteMany({})
    logger.info('existing data cleared')

    logger.info('starting seed...')
    const userIds = await seedUsers()
    const projectIds = await seedProjects(userIds)
    await seedDocuments(projectIds, userIds)
    const timesheets = await seedTimesheets(projectIds, userIds)
    await seedNotifications(userIds, timesheets)
    await seedActivities(userIds, projectIds, timesheets)

    logger.info('seed completed successfully')
    process.exit(0)
  } catch (err) {
    logger.error({ err }, 'seed failed')
    process.exit(1)
  } finally {
    await closeDb()
  }
}

main()
