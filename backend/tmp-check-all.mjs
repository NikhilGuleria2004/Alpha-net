import 'dotenv/config'
import { createRequire } from 'module'
import { MongoClient } from 'mongodb'

const require = createRequire(import.meta.url)
const bcrypt = require('bcryptjs')

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db(process.env.MONGODB_DB_NAME)

const users = await db.collection('users').find({}).toArray()
for (const u of users) {
  const match = await bcrypt.compare('Password123!', u.passwordHash)
  console.log(`${u.email} (${u.role}, ${u.status}): Password123! matches = ${match}`)
}

// Check current sessions
const sessions = await db.collection('sessions').find({}).sort({ createdAt: -1 }).limit(5).toArray()
console.log('\nRecent sessions:')
for (const s of sessions) {
  const user = await db.collection('users').findOne({ _id: s.userId })
  console.log(`  ${user?.email}: expires ${s.expiresAt}`)
}

await client.close()