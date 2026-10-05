import { type Response, type NextFunction } from 'express'
import { type AuthenticatedRequest } from './auth.js'
import { hasCapability, type CapabilityKey, type UserRole } from '../services/capabilities.js'

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return _res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    }
    if (!roles.includes(req.user.role as UserRole)) {
      return _res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient role' } })
    }
    next()
  }
}

export function requireCapability(...caps: CapabilityKey[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return _res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    }
    if (!hasCapability(req.user, ...caps)) {
      return _res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
    }
    next()
  }
}

// requireSelfOr: allows the user to access their own resource, or anyone with
// the given capability (e.g. managers can see all employees).
export function requireSelfOr() {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return _res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    }
    next()
  }
}
