import { SignJWT, jwtVerify } from 'jose'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret || jwtSecret.trim() === '') {
  throw new Error('JWT_SECRET is required. Set it in your environment.')
}
const secret = new TextEncoder().encode(jwtSecret)

// EMS spec §4.3: 15-min access, 30-day refresh, rotation on use.
// TTLs are configurable via env (jose duration-unit strings: '15m', '30d').
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m'
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '30d'

// Access token payload includes billable so the server-side capability check
// (§6.2) can derive openTimesheetPlatform without a DB read on every request.
export interface AccessTokenPayload {
  userId: string
  role: string
  billable: boolean
}

export async function signAccessToken(payload: AccessTokenPayload) {
  const jwt = new SignJWT(payload as any)
  jwt.setProtectedHeader({ alg: 'HS256' })
  jwt.setExpirationTime(ACCESS_TTL as any)
  return jwt.sign(secret)
}

export async function verifyAccessToken(token: string) {
  try {
    const result = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    return result.payload as AccessTokenPayload & { exp: number }
  } catch {
    return null
  }
}

// EMS spec §4.3: refresh is OPTAKE 64B random, sha256-stored in the sessions
// collection. These JWT-based helpers are retained for the platform
// compatibility layer only — the primary EMS refresh flow uses
// generateRefreshToken() + hashRefreshToken() in services/auth.service.ts.
export async function signRefreshToken(_payload: { userId: string; sessionId: string }) {
  const jwt = new SignJWT(_payload as any)
  jwt.setProtectedHeader({ alg: 'HS256' })
  jwt.setExpirationTime(REFRESH_TTL as any)
  return jwt.sign(secret)
}

export async function verifyRefreshToken(token: string) {
  try {
    const result = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    return result.payload as { userId: string; sessionId: string; exp: number }
  } catch {
    return null
  }
}
