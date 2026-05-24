import { API_BASE } from '@/lib/constants'

const BASE = API_BASE

interface RequestOptions extends RequestInit {
  params?: Record<string, string>
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...init } = options

  let url = `${BASE}${endpoint}`
  if (params) {
    const qs = new URLSearchParams(params).toString()
    url += `?${qs}`
  }

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    ...init,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail ?? `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { method: 'GET', ...options }),

  post:   <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body), ...options }),

  put:    <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body), ...options }),

  patch:  <T>(url: string, body?: unknown, options?: RequestOptions) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body), ...options }),

  delete: <T>(url: string, options?: RequestOptions) =>
    request<T>(url, { method: 'DELETE', ...options }),
}
