import { Readable } from 'node:stream';

import { ApiError } from '../errors.js';
import {
  openDirectStream,
  openRelayStream,
  relayAvailable,
  resolveTrack,
  toNodeStream,
  type UpstreamResponse,
} from './upstream.service.js';

/**
 * Streaming orchestration — two tiers, one outcome.
 *
 * 1. **Relay** (Go): the hot path. It owns range semantics, the disk tee and
 *    the upstream-death contract, so the server just mirrors its response.
 * 2. **Direct** (Node): the fallback. The server resolves through the engine
 *    and streams the CDN bytes itself. Slower and uncached, but it keeps a
 *    track playable when the relay is absent or struggling.
 *
 * The tier that served a response is reported in `X-Rheoson-Source`, so a
 * "why was that slow?" question is answerable from a single header.
 */

export interface PreparedStream {
  status: number;
  headers: Record<string, string>;
  body: Readable;
  source: 'relay' | 'direct';
}

/** Headers worth forwarding: everything a player needs to seek and to know
 * the duration, and nothing that leaks upstream identity. */
const FORWARDED_HEADERS = [
  'content-type',
  'content-length',
  'content-range',
  'accept-ranges',
  'cache-control',
  'etag',
  'last-modified',
] as const;

export function mirrorHeaders(upstream: Headers, source: 'relay' | 'direct', extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra, 'x-rheoson-source': source };
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.get(name);
    if (value) headers[name] = value;
  }
  if (!headers['accept-ranges']) headers['accept-ranges'] = 'bytes';
  if (!headers['content-type']) headers['content-type'] = 'audio/mpeg';
  return headers;
}

/**
 * Prepare a stream for one request.
 *
 * `range` is forwarded verbatim to whichever tier serves the request — a
 * player's opening request and every seek must be answered by the CDN's own
 * byte arithmetic, not by a re-implementation of it.
 */
export async function prepareStream(
  trackId: string,
  range: string | undefined,
): Promise<PreparedStream> {
  if (await relayAvailable()) {
    const relayed = await openRelayStream(trackId, range);
    if (relayed?.body) {
      return {
        status: relayed.status,
        headers: mirrorHeaders(relayed.headers, 'relay'),
        body: toNodeStream(relayed.body),
        source: 'relay',
      };
    }
    // A relay that probed healthy but cannot serve this track is a *relay*
    // problem: fall through rather than surfacing it.
  }

  return directStream(trackId, range);
}

async function directStream(trackId: string, range: string | undefined): Promise<PreparedStream> {
  let resolved = await resolveTrack(trackId);
  let upstream = await openDirectStream(resolved.url, range);

  if (!upstream?.body) {
    // A cached URL can lapse mid-flight (the CDN binds signatures to a window,
    // sometimes to the requesting IP). Extraction already works, so re-minting
    // is the fix — once, with fresh resolution rather than a blind retry.
    resolved = await resolveTrack(trackId, { fresh: true });
    upstream = await openDirectStream(resolved.url, range);
  }

  if (!upstream?.body) {
    throw mapUpstreamFailure(upstream, range);
  }

  return {
    status: upstream.status,
    headers: mirrorHeaders(upstream.headers, 'direct', {
      'content-type': resolved.contentType || 'audio/mpeg',
    }),
    body: toNodeStream(upstream.body),
    source: 'direct',
  };
}

function mapUpstreamFailure(upstream: UpstreamResponse | null, range: string | undefined): ApiError {
  if (!upstream) {
    // No response at all — unreachable CDN or a timeout.
    return new ApiError('SUP02', 502);
  }
  if (upstream.status === 416) {
    return new ApiError('SVA01', 416, `Unsatisfiable range: ${range ?? 'none'}`);
  }
  if (upstream.status === 429 || upstream.status === 503) {
    // Rate limiting is transient and worth saying precisely: it is the
    // difference between "retry shortly" and "this track is gone".
    return new ApiError('SUP02', 502, `Upstream refused with ${upstream.status}`);
  }
  return new ApiError('SUP01', upstream.status === 404 ? 404 : 502);
}
