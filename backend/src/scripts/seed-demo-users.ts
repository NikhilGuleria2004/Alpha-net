import 'dotenv/config'
import { getDb } from '../lib/mongodb.js'
import { hashPassword } from '../services/auth.service.js'
import { logger } from '../lib/logger.js'
import { ObjectId } from 'mongodb'

const demoUsers = [
  {
    name: 'Admin Demo',
    email: 'admin@alphanet.demo',
    employeeId: 'ADMIN-001',
    department: 'Engineering',
    role: 'admin',
    isSupervisor: false,
    status: 'active',
    passwordHash: '',
    supervisorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: 'User Demo',
    email: 'user@alphanet.demo',
    employeeId: 'USER-001',
    department: 'Design',
    role: 'user',
    isSupervisor: false,
    status: 'active',
    passwordHash: '',
    supervisorId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: 'Supervisor Demo',
    email: 'supervisor@alphanet.demo',
    employeeId: 'SUP-001',
    department: 'Engineering',
    role: 'user',
    isSupervisor: true,
    status: 'active',
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

    for (const user of demoUsers) {
      user.passwordHash = await hashPassword('Password123!')
      await users.updateOne({ email: user.email }, { $set: user }, { upsert: true })
      logger.info({ userId: user.email }, 'seeded demo user')
    }

    logger.info('demo users seeded successfully')
    process.exit(0)
  } catch (err) {
    logger.error({ err }, 'failed to seed demo users')
    process.exit(1)
  }
}

seed()
