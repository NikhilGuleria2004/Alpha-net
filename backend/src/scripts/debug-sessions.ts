import 'dotenv/config'
import { getDb, closeDb } from '../lib/mongodb.js'
import { ObjectId } from 'mongodb'

async function main() {
  const db = await getDb()
  const sessions = db.collection('sessions')
  const all = await sessions.find({}).sort({ createdAt: -1 }).toArray()
  console.log('total sessions:', all.length)
  for (const d of all) {
    console.log({
      userIdType: d.userId?.constructor?.name,
      userId: String(d.userId),
      refreshTokenPrefix: String(d.refreshToken).slice(0, 55),
      createdAt: d.createdAt,
      expiresAt: d.expiresAt,
    })
  }
  console.log('---collections in this db:', (await db.listCollections().toArray()).map((c) => c.name).join(', '))
  await closeDb()
}
main()