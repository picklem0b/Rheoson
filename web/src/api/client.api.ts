import { API_BASE, isClerkEnabled } from "@/lib/constants";
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
   /** Retry with a freshly minted Clerk token instead of the cached one. */
   _skipTokenCache?: boolean;
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

/**
 * Clerk hands out short-lived session JWTs (60s by default). Caching one at
 * sign-in and reusing it forever was the cause of the persistent
 * "Invalid or expired token" errors: every request after the first minute
 * carried a dead token.
 *
 * ClerkUserSync registers a provider here instead, so every request pulls a
 * token through Clerk's own cache — which refreshes transparently when the
 * cached one is near expiry. The last known token is still kept in
 * `_clerkToken` for synchronous callers (the 401 retry path, socket auth).
 */
type TokenProvider = (opts?: { skipCache?: boolean }) => Promise<string | null>;
let _clerkTokenProvider: TokenProvider | null = null;

/**
 * True when this bundle should talk to Clerk.
 *
 * Read through the accessor (not captured once) because the crash guard can
 * disable Clerk at runtime and degrade the session to local mode.
 */

/** Called by ClerkUserSync to inject the Clerk session token for API requests. */
export function setClerkToken(token: string | null) {
   _clerkToken = token;
}

/** Called by ClerkUserSync to install Clerk's refreshing token getter. */
export function setClerkTokenProvider(provider: TokenProvider | null) {
   _clerkTokenProvider = provider;
}

/**
 * Resolve the token to send with the next request.
 *
 * Clerk mode: ask the registered provider (Clerk refreshes when needed), and
 * fall back to the last known token if the lookup fails. Never fall back to
 * the persisted store token — that one is always stale in Clerk mode and
 * would recreate the 401 storm on every reload.
 */
async function resolveAuthToken(skipCache = false): Promise<string | null> {
   if (isClerkEnabled()) {
      if (_clerkTokenProvider) {
         try {
            const fresh = await _clerkTokenProvider({ skipCache });
            if (fresh) {
               _clerkToken = fresh;
               return fresh;
            }
         } catch {
            /* fall through to the cached token */
         }
      }
      return _clerkToken;
   }

   // Local / no-Clerk mode: read from the auth store's persisted state.
   if (_clerkToken) return _clerkToken;
   try {
      const raw = localStorage.getItem("rheoson-auth");
      if (raw) {
         const parsed = JSON.parse(raw);
         return parsed?.state?.token ?? null;
      }
   } catch { /* ignore */ }
   return null;
}

/** Synchronous best-effort read — used by socket auth and retry decisions. */
export function getAuthToken(): string | null {
   return _clerkToken;
}

/**
 * Authorization header for fetches that bypass the `api` client (media
 * prefetchers, service-worker probes). Resolves Clerk tokens through the
 * same refreshing provider so long-lived prefetch loops never carry a
 * stale token — without this, warm-up calls 401 silently and every first
 * play pays the full yt-dlp cost again.
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
   const token = await resolveAuthToken();
   return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
   endpoint: string,
   options: RequestOptions = {}
): Promise<T> {
   const { params, signal, _retryCount = 0, _offlineQueue = false, _skipTokenCache = false, ...init } = options;
   const method = (init.method ?? "GET").toUpperCase();

   const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>)
   };
   if (!BODY_FREE.has(method) && init.body != null) {
      headers["Content-Type"] = "application/json";
   }

   // Inject a fresh auth token if present
   const token = await resolveAuthToken(_skipTokenCache);
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
      // A web page where JSON was expected means the request reached
      // something that serves the SPA, not the API. Two ways that happens:
      // a relative /api inside a native build (there is no proxy in the
      // WebView), or a host whose catch-all route answers every path with
      // index.html. Both are configuration, not outages, so the message
      // names the base that was actually used instead of blaming the server.
      throw makeError(
         res.status,
         res.ok
            ? `The API base is misconfigured — ${API_BASE} served a web page, not JSON. Check Settings → Doctor → Diagnosis.`
            : `Backend offline (${res.status}) — nothing reachable at ${API_BASE}`
      );
   }

   if (!res.ok) {
      // 401 handling — auth endpoints must surface 401s to the form, never
      // redirect. Everything else depends on the auth mode:
      //
      // Clerk mode:
      //   - A 401 while we still had no token just means ClerkUserSync hasn't
      //     injected the fresh session token yet (cold start / restart). Retry
      //     once after a short delay instead of bouncing the user.
      //   - A 401 while we DID send a token means it is stale/expired. Never
      //     hard-redirect (that was the source of the post-login landing/auth
      //     bounce): Clerk owns the session and will flip signed-out when it
      //     is genuinely gone, which unmounts the app via the route guard.
      // Local mode:
      //   - If we believed we had a session, clear it and go to login.
      if (res.status === 401 && !endpoint.includes("/api/auth/")) {
         if (isClerkEnabled()) {
            if (token && !_skipTokenCache && _retryCount < 2) {
               // The token we sent was rejected (clock skew, revoked session,
               // or Clerk rotated the signing key). Force a non-cached token
               // once before surfacing the failure.
               return request<T>(endpoint, {
                  ...options,
                  _retryCount: _retryCount + 1,
                  _skipTokenCache: true,
               });
            }
            if (!token && _retryCount < 2) {
               // Clerk session restore + token refresh races the first wave of
               // requests on boot/restart — give it a moment before failing.
               await new Promise((r) => setTimeout(r, 600 * (_retryCount + 1)));
               return request<T>(endpoint, { ...options, _retryCount: _retryCount + 1 });
            }
         } else if (getAuthToken()) {
            localStorage.removeItem("rheoson-auth");
            window.location.href = "/login";
         }
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
