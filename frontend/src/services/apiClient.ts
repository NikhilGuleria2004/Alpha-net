const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const ACCESS_TOKEN_KEY = 'eniac_access_token'

function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

async function parseResponse(response: Response): Promise<{ ok: boolean; data: unknown; status: number }> {
  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')

  if (response.status === 204) {
    return { ok: true, data: undefined, status: response.status }
  }

  if (!isJson) {
    return {
      ok: response.ok,
      data: { message: await response.text() },
      status: response.status,
    }
  }

  const data = await response.json()
  return { ok: response.ok, data, status: response.status }
}

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retries = 1
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  const accessToken = getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const isSafeRequest = options.method === 'GET' || options.method === 'HEAD' || options.method === 'OPTIONS' || !options.method

    if (response.status === 401 && isSafeRequest && retries > 0) {
      await wait(200)
      return request<T>(endpoint, options, retries - 1)
    }

    if (response.status === 401) {
      try {
        localStorage.removeItem(ACCESS_TOKEN_KEY)
      } catch {
        // ignore
      }
      throw new Error('Unauthorized')
    }

    const { ok, data, status } = await parseResponse(response)

    if (status === 429 && retries > 0) {
      const retryAfter = response.headers.get('retry-after')
      const delayMs = retryAfter ? Number(retryAfter) * 1000 : 1000
      await wait(Math.min(delayMs, 5000))
      return request<T>(endpoint, options, retries - 1)
    }

    if (!ok) {
      const message = (data as { error?: { message?: string }; message?: string })?.error?.message || (data as { message?: string })?.message || 'Request failed'
      const code = (data as { error?: { code?: string } })?.error?.code || 'UNKNOWN_ERROR'
      throw new Error(`[${code}] ${message}`)
    }

    return data as T
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name === 'AbortError') {
      throw new Error('Request timeout')
    }
    throw err
  }
}

export const apiClient = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  }),
  patch: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
}

export default apiClient
