const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

// Access token stored in memory only — never in localStorage or sessionStorage.
// This prevents XSS attacks from stealing the token via localStorage.getItem().
// The refresh token is stored as an HttpOnly cookie by the backend, which is
// not accessible to JavaScript and is therefore already protected from XSS.
let accessToken: string | null = null

function getAccessToken(): string | null {
  return accessToken
}

function setAccessToken(token: string | null): void {
  accessToken = token
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

let refreshPromise: Promise<boolean> | null = null

function clearStoredToken(): void {
  accessToken = null
}

// Exchange the httpOnly refresh cookie for a fresh access token via POST
// /auth/refresh (backend auth.controller.ts). Single-flight: concurrent 401s
// share one in-flight refresh instead of firing N refresh requests. The
// endpoint is invoked with retries=0 so its own 401 path never recurses back
// into this logic.
function attemptRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = request<{ accessToken?: string }>('/auth/refresh', { method: 'POST' }, 0)
    .then((data) => {
      if (data?.accessToken) {
        accessToken = data.accessToken
        return true
      }
      return false
    })
    .catch(() => false)
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retries = 1
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  const accessToken = getAccessToken()
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = {
    // For multipart/form-data uploads the browser must set Content-Type itself
    // (with the auto-generated boundary); a fixed application/json header would
    // make multer reject the request.
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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

    if (response.status === 401 && retries > 0) {
      // Access token likely expired. Exchange the httpOnly refresh cookie for a
      // fresh token and retry the original request once (C6). A repeated 401
      // with retries exhausted falls through and forces a clean re-login.
      const refreshed = await attemptRefresh()
      if (refreshed) {
        return request<T>(endpoint, options, retries - 1)
      }
    }

    if (response.status === 401) {
      clearStoredToken()
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
  put: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  }),
  patch: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
}

export { setAccessToken, getAccessToken }

/**
 * Authenticated binary download (QA H8): fetch → Blob for endpoints that stream
 * file content (e.g. GET /documents/:id/download). Uses the same in-memory
 * access token + credentials:include as request(), but returns the raw Blob
 * instead of parsing JSON. The filename is extracted from Content-Disposition
 * when the server provides one.
 */
export async function downloadBlob(endpoint: string): Promise<{ blob: Blob; filename: string | null }> {
  const url = `${API_BASE_URL}${endpoint}`
  const token = getAccessToken()
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })
  if (!response.ok) {
    let message = 'Download failed'
    try {
      const data = (await response.json()) as { error?: { message?: string } }
      message = data?.error?.message || message
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition')
  let filename: string | null = null
  if (disposition) {
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/)
    if (match) {
      try {
        filename = decodeURIComponent(match[1] ?? match[2])
      } catch {
        filename = match[1] ?? match[2] ?? null
      }
    }
  }
  return { blob, filename }
}

export default apiClient
