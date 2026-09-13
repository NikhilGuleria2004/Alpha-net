import { type Request, type Response, type NextFunction } from 'express'
import { ObjectId } from 'mongodb'
import { verifyAccessToken } from '../lib/jwt.js'
import { getDb } from '../lib/mongodb.js'
import { COLLECTIONS } from '../lib/collections.js'
import { logger } from '../lib/logger.js'

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    role: string
    isSupervisor: boolean
  }
}

// In-memory user cache to reduce DB lookups on every request
// TTL is short (60s) to ensure role/status changes propagate quickly
interface CachedUser {
  userId: string
  role: string
  isSupervisor: boolean
  expiresAt: number
}

const userCache = new Map<string, CachedUser>()
const USER_CACHE_TTL_MS = 60 * 1000 // 60 seconds

function getCachedUser(userId: string): CachedUser | undefined {
  const cached = userCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached
  }
  userCache.delete(userId)
  return undefined
}

function setCachedUser(userId: string, user: Omit<CachedUser, 'expiresAt'>) {
  userCache.set(userId, { ...user, expiresAt: Date.now() + USER_CACHE_TTL_MS })
}

// Clear cache for a user (e.g., on deactivation, role change, password change)
export function invalidateUserCache(userId: string) {
  userCache.delete(userId)
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } })
  }

  const token = authHeader.slice(7)
  const payload = await verifyAccessToken(token)
  if (!payload) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } })
  }

  // Check cache first, then fall back to DB
  let cached = getCachedUser(payload.userId)
  if (!cached) {
    const db = await getDb()
    const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(payload.userId), status: 'active' })
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found or inactive' } })
    }
    cached = { userId: user._id.toString(), role: user.role, isSupervisor: user.isSupervisor, expiresAt: 0 }
    setCachedUser(payload.userId, { userId: cached.userId, role: cached.role, isSupervisor: cached.isSupervisor })
  }

  req.user = { userId: cached.userId, role: cached.role, isSupervisor: cached.isSupervisor }
  next()
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } })
  }
  next()
}

export function requireSupervisor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.isSupervisor) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Supervisor access required' } })
  }
  next()
}

export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const payload = await verifyAccessToken(token)
    if (payload) {
      const db = await getDb()
      const user = await db.collection(COLLECTIONS.USERS).findOne({ _id: new ObjectId(payload.userId), status: 'active' })
      if (user) {
        req.user = { userId: user._id.toString(), role: user.role, isSupervisor: user.isSupervisor }
      }
    }
  }
  next()
}
