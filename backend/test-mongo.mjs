import 'dotenv/config'
import { getDb } from './dist/src/lib/mongodb.js'

async function test() {
  try {
    const db = await getDb()
    console.log('DB connected')
    const result = await db.collection('users').findOne({ email: 'admin@alphanet.demo' })
    console.log('User:', result?.name)
  } catch (err) {
    console.error('Error:', err.message)
  }
}

test()
