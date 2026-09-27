'use client';

/**
 * A fetch-based event stream.
 *
 * `EventSource` is the obvious choice and the wrong one here: it cannot send an
 * `Authorization` header, and the API authenticates every route — including the
 * stream. A session token in a query string is not an option (URLs land in logs
 * and history). So the stream is read from a `fetch` body instead, which is
 * what the native shells do too and keeps one auth mechanism for everything.
 *
 * Reconnection is handled here with backoff, because a dropped progress stream
 * must not silently stop updating a download list.
 */

export interface StreamEvent {
  event: string;
  data: unknown;
}

export interface StreamOptions {
  /** Headers to send — typically the session's. */
  headers: () => Record<string, string>;
  onEvent: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  /** Retry delays in ms. The last value repeats. */
  backoff?: number[];
}

/** Connect and keep reconnecting until the returned function is called. */
export function openEventStream(url: string, options: StreamOptions): () => void {
  const backoff = options.backoff ?? [1000, 2000, 5000, 10000];
  let attempt = 0;
  let closed = false;
  const controller = new AbortController();

  const connect = async (): Promise<void> => {
    if (closed) return;

    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/event-stream', ...options.headers() },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream responded ${res.status}`);

      attempt = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. A partial frame stays in
        // the buffer until its terminator arrives.
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const parsed = parseFrame(frame);
          if (parsed) options.onEvent(parsed);
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (cause) {
      if (closed) return;
      options.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
    }

    if (closed) return;
    const delay = backoff[Math.min(attempt, backoff.length - 1)];
    attempt += 1;
    window.setTimeout(() => void connect(), delay);
  };

  void connect();

  return () => {
    closed = true;
    controller.abort();
  };
}

/** One frame → one event. Comments and unknown fields are ignored. */
export function parseFrame(frame: string): StreamEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '');

    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }

  if (dataLines.length === 0) return null;
  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) as unknown };
  } catch {
    // A non-JSON payload is still an event; handing back the raw string beats
    // dropping it, which is how a progress stream appears to stall.
    return { event, data: raw };
  }
}
