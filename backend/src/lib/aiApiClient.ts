import { logger } from './logger.js'

// Phase 7: internal HTTP client — the AI layer talks to OUR OWN REST API as
// the calling user. It never uses getDb() / COLLECTIONS. The user's Bearer
// token is forwarded so all existing auth + access-control middleware applies
// unchanged (the AI can only do what the user could do manually).

function getInternalApiBase(): string {
  const base = process.env.INTERNAL_API_BASE_URL || 'http://localhost:3001/api/v1'
  return base.replace(/\/$/, '')
}

export class PlatformApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'PlatformApiError'
    this.status = status
    this.code = code
  }
}

export async function callPlatformApi<T>(
  userToken: string,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  if (!userToken) {
    throw new PlatformApiError(401, 'NO_USER_TOKEN', 'Missing user token for platform API call')
  }
  const url = `${getInternalApiBase()}${path.startsWith('/') ? path : `/${path}`}`
  logger.debug({ method, path }, 'AI internal platform API call')

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new PlatformApiError(503, 'PLATFORM_UNREACHABLE', `Platform API unreachable: ${(err as Error).message}`)
  }

  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const errObj = (data as { error?: { code?: string; message?: string } })?.error
    throw new PlatformApiError(res.status, errObj?.code || 'PLATFORM_ERROR', errObj?.message || `Platform API ${res.status}`)
  }
  return data as T
}
