import { getDb } from './mongodb.js'
import { logger } from './logger.js'

export const COLLECTIONS = {
  USERS: 'users',
  PROJECTS: 'projects',
  TIMESHEETS: 'timesheets',
  NOTIFICATIONS: 'notifications',
  ACTIVITIES: 'activities',
  DOCUMENTS: 'documents',
  SESSIONS: 'sessions',
} as const

export async function ensureIndexes(): Promise<void> {
  const db = await getDb()

  const users = db.collection(COLLECTIONS.USERS)
  await users.createIndex({ email: 1 }, { unique: true })
  await users.createIndex({ employeeId: 1 }, { unique: true })
  await users.createIndex({ supervisorId: 1 })
  await users.createIndex({ status: 1 })
  await users.createIndex({ isSupervisor: 1 })

  const projects = db.collection(COLLECTIONS.PROJECTS)
  await projects.createIndex({ sowNumber: 1 }, { unique: true })
  await projects.createIndex({ status: 1 })
  await projects.createIndex({ managerId: 1 })
  await projects.createIndex({ supervisorId: 1 })
  await projects.createIndex({ teamMemberIds: 1 })
  await projects.createIndex({ startDate: 1 })
  await projects.createIndex({ endDate: 1 })
  await projects.createIndex({ deadline: 1 })

  const timesheets = db.collection(COLLECTIONS.TIMESHEETS)
  await timesheets.createIndex({ userId: 1 })
  await timesheets.createIndex({ projectId: 1 })
  await timesheets.createIndex({ weekStart: 1 })
  await timesheets.createIndex({ status: 1 })
  await timesheets.createIndex({ userId: 1, projectId: 1, weekStart: 1 }, { unique: true })

  const notifications = db.collection(COLLECTIONS.NOTIFICATIONS)
  await notifications.createIndex({ userId: 1 })
  await notifications.createIndex({ read: 1 })
  await notifications.createIndex({ createdAt: -1 })

  const activities = db.collection(COLLECTIONS.ACTIVITIES)
  await activities.createIndex({ userId: 1 })
  await activities.createIndex({ projectId: 1 })
  await activities.createIndex({ timesheetId: 1 })
  await activities.createIndex({ createdAt: -1 })

  const documents = db.collection(COLLECTIONS.DOCUMENTS)
  await documents.createIndex({ projectId: 1 })
  await documents.createIndex({ uploadedBy: 1 })
  await documents.createIndex({ createdAt: -1 })

  const sessions = db.collection(COLLECTIONS.SESSIONS)
  await sessions.createIndex({ userId: 1 })
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  logger.info({ collections: Object.values(COLLECTIONS) }, 'ensured indexes')
}
