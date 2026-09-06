import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'change-me-in-production')

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
