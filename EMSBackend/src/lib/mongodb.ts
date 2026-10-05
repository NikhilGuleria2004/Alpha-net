import { MongoClient, type Db, type MongoClientOptions } from 'mongodb'
import { validateEnv } from './env.js'

const globalForMongo = globalThis as unknown as {
  __mongoClient: MongoClient | undefined
  __mongoDb: Db | undefined
}

/**
 * Connection-pool sizing.
 *
 * Every function instance constructs its own pool, so a serverless platform
 * running N instances multiplies these numbers by N against one shared Atlas
 * connection limit. The serverless default is therefore small, and a
 * `minPoolSize` of 0 lets the backing cluster scale to zero between bursts
 * instead of pinning a connection per idle instance. Both are overridable per
 * deployment without a code change.
 */
function poolSize(name: string, serverlessDefault: number, localDefault: number): number {
  const configured = Number(process.env[name])
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured)
  return process.env.VERCEL ? serverlessDefault : localDefault
}

export function getMongoClient(): MongoClient {
  if (globalForMongo.__mongoClient) return globalForMongo.__mongoClient

  validateEnv()

  const uri = process.env.MONGODB_URI as string
  const options: MongoClientOptions = {
    maxPoolSize: poolSize('MONGODB_MAX_POOL_SIZE', 5, 10),
    minPoolSize: poolSize('MONGODB_MIN_POOL_SIZE', 0, 1),
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

  const dbName = process.env.MONGODB_DB_NAME || 'eniac'
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
