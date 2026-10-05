/**
 * EMS API client (EMSFrontend.md §9.1–9.2, §14 Phase 3 3.1).
 *
 * This is the security + reliability boundary (ported verbatim from the sibling
 * `frontend/src/services/apiClient.ts`):
 *   - access token kept in a module-private variable — never localStorage — so an
 *     XSS cannot exfiltrate it via `.getItem()` (interface_guide.txt:14 "Token
 *     storage"); the refresh token lives in an httpOnly cookie the backend sets.
 *   - single-flight refresh on 401: concurrent expired-token requests share one
 *     in-flight `/auth/refresh` instead of firing N of them.
 *   - 429 retry honoring `Retry-After`, except `AI_QUOTA_EXCEEDED` which is not
 *     transient (burning retries only delays the message to the user).
 *   - 15s request timeout via AbortController.
 *   - FormData bodies omit `Content-Type` so the browser emits the multipart
 *     boundary multer expects.
 *
 * EMS extension: the `ApiAdapter` interface and the `api` switch
 * (`VITE_USE_MOCK === 'true' ? mockAdapter : httpAdapter`) live here so every
 * service imports ONE symbol (`api`) and the mock↔real swap is a single env
 * flag (§9.3). The real HTTP adapter is `apiClient` itself (httpAdapter is a
 * re-export alias so the two adapters have parallel names).
 */
import { mockAdapter } from './mockAdapter'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

// --- Access token: memory-only ------------------------------------------------
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

function clearStoredToken(): void {
  accessToken = null
}

// --- Response parsing ---------------------------------------------------------

async function parseResponse(
  response: Response,
): Promise<{ ok: boolean; data: unknown; status: number }> {
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Single-flight refresh ----------------------------------------------------

let refreshPromise: Promise<boolean> | null = null

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

/**
 * Low-level fetch wrapper. Services do NOT call this directly — they go through
 * `api` (the mock/real switch) so a single env flag redirects every call.
 */
export async function request<T>(endpoint: string, options: RequestInit = {}, retries = 1): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  const token = getAccessToken()
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
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
      const refreshed = await attemptRefresh()
      if (refreshed) return request<T>(endpoint, options, retries - 1)
    }

    if (response.status === 401) {
      clearStoredToken()
      throw new Error('Unauthorized')
    }

    const { ok, data, status } = await parseResponse(response)

    const errorCode = (data as { error?: { code?: string } })?.error?.code
    if (status === 429 && retries > 0 && errorCode !== 'AI_QUOTA_EXCEEDED') {
      const retryAfter = response.headers.get('retry-after')
      const delayMs = retryAfter ? Number(retryAfter) * 1000 : 1000
      await wait(Math.min(delayMs, 5000))
      return request<T>(endpoint, options, retries - 1)
    }

    if (!ok) {
      const message =
        (data as { error?: { message?: string }; message?: string })?.error?.message ||
        (data as { message?: string })?.message ||
        'Request failed'
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

// --- Real HTTP adapter --------------------------------------------------------

/** The contract every adapter (real and mock) implements. §9.3. */
export interface ApiAdapter {
  get<T = unknown>(endpoint: string): Promise<T>
  post<T = unknown>(endpoint: string, body?: unknown): Promise<T>
  put<T = unknown>(endpoint: string, body?: unknown): Promise<T>
  patch<T = unknown>(endpoint: string, body?: unknown): Promise<T>
  delete<T = unknown>(endpoint: string): Promise<T>
}

export const httpAdapter: ApiAdapter = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
}

/**
 * Convenience object retained for direct use in the one or two call sites that
 * bypass the adapter switch (e.g. the auth bootstrap). Services use `api`.
 */
export const apiClient: ApiAdapter = httpAdapter

// --- The single switch point --------------------------------------------------
// §9.3: every service imports `api`. Flipping VITE_USE_MOCK to false in Phase 8
// re-points all calls at the real backend with zero component changes.
export const api: ApiAdapter = import.meta.env.VITE_USE_MOCK === 'true' ? mockAdapter : httpAdapter

export async function refresh(): Promise<boolean> {
  try {
    const data = await request<{ accessToken?: string }>('/auth/refresh', { method: 'POST' }, 0)
    if (data?.accessToken) {
      accessToken = data.accessToken
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Authenticated binary download (§9.1 blob path) — fetch → Blob for endpoints
 * that stream file content. Uses the in-memory access token + credentials:include.
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
