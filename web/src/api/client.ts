import { API_BASE } from '@/lib/constants'

// ── Types ─────────────────────────────────────────────────────

export interface ApiError extends Error {
  status:  number
  detail:  string
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
  signal?: AbortSignal
}

// ── Helpers ───────────────────────────────────────────────────

/** Methods that must NOT send a Content-Type / body. */
const BODY_FREE = new Set(['GET', 'HEAD', 'DELETE'])

function buildUrl(endpoint: string, params?: RequestOptions['params']): string {
  const url = `${API_BASE}${endpoint}`
  if (!params) return url

  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${url}?${s}` : url
}

function makeError(status: number, detail: string): ApiError {
  const err = new Error(detail) as ApiError
  err.status = status
  err.detail = detail
  return err
}

// ── Core fetch ────────────────────────────────────────────────

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { params, signal, ...init } = options
  const method = (init.method ?? 'GET').toUpperCase()

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  }

  // Only attach Content-Type for requests that carry a body
  if (!BODY_FREE.has(method) && init.body != null) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(buildUrl(endpoint, params), {
    ...init,
    method,
    headers,
    signal,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body?.detail ?? body?.message ?? detail
    } catch { /* ignore parse errors */ }
    throw makeError(res.status, detail)
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }

  return res.json() as Promise<T>
}

// ── Public client ─────────────────────────────────────────────

export const api = {
  get: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'GET' }),

  post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'POST', body: body != null ? JSON.stringify(body) : undefined }),

  put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'PUT', body: body != null ? JSON.stringify(body) : undefined }),

  patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'PATCH', body: body != null ? JSON.stringify(body) : undefined }),

  delete: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { ...options, method: 'DELETE' }),
}

// ── Abort helper ──────────────────────────────────────────────
// Usage: const { signal, abort } = makeAbortable()
//        api.get('/search', { params: { q }, signal })
//        abort()   // cancels the request

export function makeAbortable() {
  const controller = new AbortController()
  return {
    signal: controller.signal,
    abort:  () => controller.abort(),
  }
}

/** Returns true for errors that are AbortController cancellations. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
