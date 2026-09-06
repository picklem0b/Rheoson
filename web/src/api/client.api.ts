import { API_BASE } from "@/lib/constants";
import { isOnline } from "@/lib/network";
import { queueMutation, initAutoSync } from "@/lib/offlineQueue";

export interface ApiError extends Error {
   status: number;
   detail: string;
}

interface RequestOptions extends RequestInit {
   params?: Record<string, string | number | boolean | undefined>;
   signal?: AbortSignal;
   _retryCount?: number;
   /** If true, this request will be queued locally when offline instead of throwing. */
   _offlineQueue?: boolean;
}

const BODY_FREE = new Set(["GET", "HEAD", "DELETE"]);

function buildUrl(endpoint: string, params?: RequestOptions["params"]): string {
   const url = `${API_BASE}${endpoint}`;
   if (!params) return url;
   const qs = new URLSearchParams();
   for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
   }
   const s = qs.toString();
   return s ? `${url}?${s}` : url;
}

function makeError(status: number, detail: string): ApiError {
   const err = new Error(detail) as ApiError;
   err.status = status;
   err.detail = detail;
   return err;
}

let _clerkToken: string | null = null;

/** Called by ClerkUserSync to inject the Clerk session token for API requests. */
export function setClerkToken(token: string | null) {
   _clerkToken = token;
}

function getAuthToken(): string | null {
   // Prefer Clerk session token when available
   if (_clerkToken) return _clerkToken;
   try {
      // Fallback: read from the auth store's persisted state
      const raw = localStorage.getItem("rheoson-auth");
      if (raw) {
         const parsed = JSON.parse(raw);
         return parsed?.state?.token ?? null;
      }
   } catch { /* ignore */ }
   return null;
}

async function request<T>(
   endpoint: string,
   options: RequestOptions = {}
): Promise<T> {
   const { params, signal, _retryCount = 0, _offlineQueue = false, ...init } = options;
   const method = (init.method ?? "GET").toUpperCase();

   const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>)
   };
   if (!BODY_FREE.has(method) && init.body != null) {
      headers["Content-Type"] = "application/json";
   }

   // Inject auth token if present
   const token = getAuthToken();
   if (token) {
      headers["Authorization"] = `Bearer ${token}`;
   }

   // ── Offline handling ───────────────────────────────────
   // If we're offline and this is a mutation, queue it instead of failing
   if (!isOnline() && !BODY_FREE.has(method) && _offlineQueue) {
      // Queue for later sync — return a synthetic success
      queueMutation({
         method,
         endpoint,
         body: init.body ? JSON.parse(init.body as string) : undefined,
      });

      // Return a fake 200 response for mutations queued offline
      return {} as T;
   }

   let res: Response;

   try {
      res = await fetch(buildUrl(endpoint, params), {
         ...init,
         method,
         headers,
         signal
      });
   } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (!isAbort && _retryCount < 2) {
         const delay = _retryCount === 0 ? 3000 : 5000;
         await new Promise(r => setTimeout(r, delay));
         return request<T>(endpoint, { ...options, _retryCount: _retryCount + 1 });
      }
      throw makeError(
         0,
         "Cannot reach the API server. It may be waking up — try again in a moment."
      );
   }

   const contentType = res.headers.get("content-type") ?? "";
   if (contentType.includes("text/html")) {
      throw makeError(
         res.status,
         res.ok
            ? "Backend returned HTML instead of JSON — is the API running?"
            : `Backend offline (${res.status})`
      );
   }

   if (!res.ok) {
      // Auto-redirect to login on 401 — but only when we believed we had a
      // session. Auth endpoints (login/register) return 401 for bad
      // credentials and must surface that to the form, not redirect.
      if (
         res.status === 401 &&
         !endpoint.includes("/api/auth/") &&
         getAuthToken()
      ) {
         localStorage.removeItem("rheoson-auth");
         window.location.href = "/login";
      }
      let detail = `HTTP ${res.status}`;
      try {
         const body = await res.json();
         detail = body?.detail ?? body?.message ?? detail;
      } catch {
         /* ignore */
      }
      throw makeError(res.status, detail);
   }

   if (res.status === 204 || res.headers.get("content-length") === "0") {
      return undefined as T;
   }

   return res.json() as Promise<T>;
}

export const api = {
   get: <T>(url: string, opts?: RequestOptions) =>
      request<T>(url, { ...opts, method: "GET" }),
   post: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
      request<T>(url, {
         ...opts,
         method: "POST",
         body: body != null ? JSON.stringify(body) : undefined
      }),
   put: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
      request<T>(url, {
         ...opts,
         method: "PUT",
         body: body != null ? JSON.stringify(body) : undefined
      }),
   patch: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
      request<T>(url, {
         ...opts,
         method: "PATCH",
         body: body != null ? JSON.stringify(body) : undefined
      }),
   delete: <T>(url: string, opts?: RequestOptions) =>
      request<T>(url, { ...opts, method: "DELETE" }),

   /** POST with offline queue support — queued when offline. */
   postQueued: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
      request<T>(url, {
         ...opts,
         method: "POST",
         body: body != null ? JSON.stringify(body) : undefined,
         _offlineQueue: true,
      }),

   /** DELETE with offline queue support — queued when offline. */
   deleteQueued: <T>(url: string, opts?: RequestOptions) =>
      request<T>(url, { ...opts, method: "DELETE", _offlineQueue: true }),

   /** PATCH with offline queue support — queued when offline. */
   patchQueued: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
      request<T>(url, {
         ...opts,
         method: "PATCH",
         body: body != null ? JSON.stringify(body) : undefined,
         _offlineQueue: true,
      }),
};

export function makeAbortable() {
   const controller = new AbortController();
   return { signal: controller.signal, abort: () => controller.abort() };
}

export function isAbortError(err: unknown): boolean {
   return err instanceof DOMException && err.name === "AbortError";
}

// Initialize auto-sync on module load
initAutoSync();
