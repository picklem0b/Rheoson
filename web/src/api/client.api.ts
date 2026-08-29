import { API_BASE } from "@/lib/constants";

export interface ApiError extends Error {
   status: number;
   detail: string;
}

interface RequestOptions extends RequestInit {
   params?: Record<string, string | number | boolean | undefined>;
   signal?: AbortSignal;
   _retryCount?: number;
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

async function request<T>(
   endpoint: string,
   options: RequestOptions = {}
): Promise<T> {
   const { params, signal, _retryCount = 0, ...init } = options;
   const method = (init.method ?? "GET").toUpperCase();

   const headers: Record<string, string> = {
      ...(init.headers as Record<string, string>)
   };
   if (!BODY_FREE.has(method) && init.body != null) {
      headers["Content-Type"] = "application/json";
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
      // TypeError = network failure ("Failed to fetch") — could be Render cold
      // start or backend offline. Retry with exponential backoff:
      //   Attempt 1 → 3 s (handles most Render cold starts)
      //   Attempt 2 → 5 s (slow cold start or transient failure)
      //   Then give up and surface the error.
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

   // Detect HTML response — happens when:
   //   • Vite proxy can't reach the backend and returns its own error page
   //   • A CDN / load balancer intercepts before the API responds
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
      request<T>(url, { ...opts, method: "DELETE" })
};

export function makeAbortable() {
   const controller = new AbortController();
   return { signal: controller.signal, abort: () => controller.abort() };
}

export function isAbortError(err: unknown): boolean {
   return err instanceof DOMException && err.name === "AbortError";
}
