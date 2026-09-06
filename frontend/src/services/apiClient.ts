const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retries = 1
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
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
      try {
        await fetch(`${API_BASE_URL}/auth/me`, {
          method: 'GET',
          headers,
          credentials: 'include',
        })
      } catch {
        window.location.href = '/login'
        throw new Error('Unauthorized')
      }
      return request<T>(endpoint, options, retries - 1)
    }

    if (response.status === 401) {
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }

    if (response.status === 204) {
      return undefined as T
    }

    const data = await response.json()

    if (!response.ok) {
      const message = data?.error?.message || data?.message || 'Request failed'
      const code = data?.error?.code || 'UNKNOWN_ERROR'
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
