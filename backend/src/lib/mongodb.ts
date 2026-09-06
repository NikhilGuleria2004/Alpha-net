import { MongoClient, type Db, type MongoClientOptions } from 'mongodb'
import { validateEnv } from './env.js'

const globalForMongo = globalThis as unknown as {
  __mongoClient: MongoClient | undefined
  __mongoDb: Db | undefined
}

export function getMongoClient(): MongoClient {
  if (globalForMongo.__mongoClient) return globalForMongo.__mongoClient

  validateEnv()

  const uri = process.env.MONGODB_URI as string
  const options: MongoClientOptions = {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
  }

  const client = new MongoClient(uri, options)
  globalForMongo.__mongoClient = client
  return client
}

export async function getDb(): Promise<Db> {
  if (globalForMongo.__mongoDb) return globalForMongo.__mongoDb

  const client = getMongoClient()
  await client.connect()

  const dbName = process.env.MONGODB_DB_NAME || 'alphanet'
  const db = client.db(dbName)
  globalForMongo.__mongoDb = db
  return db
}

export async function closeDb(): Promise<void> {
  if (globalForMongo.__mongoClient) {
    await globalForMongo.__mongoClient.close()
    globalForMongo.__mongoClient = undefined
    globalForMongo.__mongoDb = undefined
  }
}
