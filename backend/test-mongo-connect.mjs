import 'dotenv/config'
import { getDb } from './dist/src/lib/mongodb.js'

async function test() {
  try {
    const db = await getDb()
    console.log('DB connected successfully')
    const users = await db.collection('users').find({}).limit(5).toArray()
    console.log('Users found:', users.length)
    for (const user of users) {
      console.log(' -', user.email, user.role)
    }
  } catch (err) {
    console.error('Error:', err.message)
  }
}

test()
