import { SignJWT, jwtVerify } from 'jose'
import { parseObjectId } from './objectid.js'

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret || jwtSecret.trim() === '') {
  throw new Error('JWT_SECRET is required. Set it in your environment.')
}
const secret = new TextEncoder().encode(jwtSecret)

export async function signAccessToken(payload: { userId: string; role: string; isSupervisor: boolean }) {
  const jwt = new SignJWT(payload as any)
  jwt.setProtectedHeader({ alg: 'HS256' })
  jwt.setExpirationTime('1h')
  return jwt.sign(secret)
}

export async function verifyAccessToken(token: string) {
  try {
    const result = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    return result.payload as { userId: string; role: string; isSupervisor: boolean; exp: number }
  } catch {
    return null
  }
}

export async function signRefreshToken(payload: { userId: string; sessionId: string }) {
  const jwt = new SignJWT(payload as any)
  jwt.setProtectedHeader({ alg: 'HS256' })
  jwt.setExpirationTime('7d')
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
