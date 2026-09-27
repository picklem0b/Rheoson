// Package relay is the hot path: one HTTP handler that turns a track id into
// bytes on the wire, with range transparency, a disk tee, and a promise that
// an upstream death never becomes a raised error.
//
// The semantics are ported from the current stack's stream service (v2.21.4),
// where three lessons cost real debugging time and are now encoded here:
//
//  1. Forward the client's Range header verbatim. A player's opening request
//     and every seek must get the CDN's own Content-Length/Content-Range.
//  2. Never buffer a whole track to answer a range request. Partial responses
//     are streamed straight through; only whole-file requests are eligible
//     for the cache tee.
//  3. Upstream death mid-stream is *reported*, not raised. The response ends,
//     the diagnostics land in the status header/trailer and one JSON log line.
package relay

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/rheoson/relay/internal/cache"
	"github.com/rheoson/relay/internal/config"
	"github.com/rheoson/relay/internal/resolver"
)

// DefaultContentType is the fallback when neither the resolver nor the CDN
// states one. Audio is the only thing this service relays.
const DefaultContentType = "audio/mpeg"

// copyBufferSize is large enough to keep syscalls cheap on a phone and small
// enough that a cancel is felt immediately.
const copyBufferSize = 64 * 1024

// Handler serves /relay/audio and /relay/health.
type Handler struct {
	cfg      config.Config
	resolver *resolver.Resolver
	cache    *cache.Cache
	log      *slog.Logger
	upstream *http.Client
}

// NewHandler wires a relay. The upstream client deliberately has no overall
// timeout: a track can legitimately stream for minutes, but time-to-first-byte
// is bounded by the transport's ResponseHeaderTimeout.
func NewHandler(cfg config.Config, res *resolver.Resolver, c *cache.Cache, log *slog.Logger) *Handler {
	if log == nil {
		log = slog.Default()
	}
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ResponseHeaderTimeout: cfg.UpstreamTimeout,
		IdleConnTimeout:       90 * time.Second,
		ExpectContinueTimeout: time.Second,
		MaxIdleConnsPerHost:   8,
	}
	return &Handler{
		cfg:      cfg,
		resolver: res,
		cache:    c,
		log:      log,
		upstream: &http.Client{Transport: transport},
	}
}

// Routes returns the relay's mux.
func (h *Handler) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/relay/health", h.recover(h.handleHealth))
	mux.HandleFunc("/relay/audio", h.recover(h.handleAudio))
	return mux
}

// ── health ────────────────────────────────────────────────────

type healthPayload struct {
	Status             string `json:"status"`
	ResolverConfigured bool   `json:"resolverConfigured"`
	CacheEnabled       bool   `json:"cacheEnabled"`
	CachedTracks       int    `json:"cachedTracks"`
	CachedBytes        int64  `json:"cachedBytes"`
}

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	stats := h.cache.Stats()
	writeJSON(w, http.StatusOK, healthPayload{
		Status:             "ok",
		ResolverConfigured: h.resolver.Configured(),
		CacheEnabled:       h.cache.Enabled(),
		CachedTracks:       stats.Tracks,
		CachedBytes:        stats.Bytes,
	})
}

// ── audio ─────────────────────────────────────────────────────

func (h *Handler) handleAudio(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeStatusError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if !h.authorized(r) {
		writeStatusError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	trackID := strings.TrimSpace(r.URL.Query().Get("track"))
	if trackID == "" {
		writeStatusError(w, http.StatusBadRequest, "missing_track")
		return
	}
	rangeHeader := r.Header.Get("Range")

	// Tier 1: the disk tee. A locally cached file is served with full range
	// support and never touches the network.
	if entry, ok := h.cache.Open(trackID); ok {
		h.serveCached(w, r, trackID, entry, rangeHeader)
		return
	}

	// Tier 2: resolve then stream straight through.
	h.serveUpstream(w, r, trackID, rangeHeader)
}

func (h *Handler) authorized(r *http.Request) bool {
	if h.cfg.Token == "" {
		// No token configured means this relay is meant to be reached only
		// from inside the compose network; that is the operator's call.
		return true
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		return strings.TrimSpace(auth[7:]) == h.cfg.Token
	}
	return strings.TrimSpace(r.Header.Get("X-Relay-Token")) == h.cfg.Token
}

func (h *Handler) serveCached(w http.ResponseWriter, r *http.Request, trackID string, entry cache.Entry, rangeHeader string) {
	file, err := os.Open(entry.Path)
	if err != nil {
		// The entry vanished between the stat and the open — fall through to
		// the network rather than failing the play.
		h.serveUpstream(w, r, trackID, rangeHeader)
		return
	}
	defer file.Close()

	contentType := entry.ContentType
	if contentType == "" {
		contentType = DefaultContentType
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("X-Relay-Status", statusHeader("cache", "", 0, entry.Size))
	// http.ServeContent owns the range arithmetic, the 206/416 decisions and
	// the HEAD path — the same correctness the proxy tier needs, for free.
	http.ServeContent(w, r, trackID, fileModTime(entry.Path), file)
}

func fileModTime(path string) time.Time {
	if info, err := os.Stat(path); err == nil {
		return info.ModTime()
	}
	return time.Time{}
}

func (h *Handler) serveUpstream(w http.ResponseWriter, r *http.Request, trackID, rangeHeader string) {
	if !h.resolver.Configured() {
		writeStatusError(w, http.StatusServiceUnavailable, "resolver_unconfigured")
		return
	}

	// The CDN's audio URLs are range-gated. Measured against a real one: a
	// request with no Range header stalls until the client gives up, while the
	// same URL answers `bytes=0-` with the entire file in one 206. A player that
	// opens a track without asking for bytes (Safari does) would therefore fail
	// on a URL that works, so the relay always asks for a range and normalises
	// the answer back into what the client actually asked for.
	implicitRange := rangeHeader == ""
	upstreamRange := rangeHeader
	if implicitRange {
		upstreamRange = bytesFromStart
	}

	res, resolved, err := h.openUpstream(r.Context(), trackID, upstreamRange)
	if err != nil {
		h.reportUpstreamFailure(w, trackID, err)
		return
	}
	defer res.Body.Close()

	contentType := firstNonEmpty(
		res.Header.Get("Content-Type"),
		resolved.ContentType,
		DefaultContentType,
	)
	expected := contentLength(res)

	// A 206 that covers the whole file is the answer to our implicit range: it
	// is a complete download, so it is tee-eligible, and a client that asked
	// for nothing gets a 200 rather than a 206 it never requested. A *capped*
	// 206 is passed through untouched — turning a truncated body into a 200
	// would be a silent lie about the length.
	wholeFile := false
	normaliseToWhole := false
	switch {
	case IsWholeFile(rangeHeader) && res.StatusCode == http.StatusOK:
		wholeFile = true
	case implicitRange && res.StatusCode == http.StatusPartialContent && spansWholeFile(res.Header.Get("Content-Range")):
		wholeFile = true
		normaliseToWhole = true
	}

	if !normaliseToWhole {
		copyHeader(w.Header(), res.Header, "Content-Range")
	}
	copyHeader(w.Header(), res.Header, "Accept-Ranges")
	copyHeader(w.Header(), res.Header, "Cache-Control")
	copyHeader(w.Header(), res.Header, "ETag")
	copyHeader(w.Header(), res.Header, "Last-Modified")
	if cachedControl := w.Header().Get("Cache-Control"); cachedControl == "" {
		w.Header().Set("Cache-Control", "public, max-age=3600")
	}
	if w.Header().Get("Accept-Ranges") == "" {
		w.Header().Set("Accept-Ranges", "bytes")
	}
	w.Header().Set("Content-Type", contentType)
	if expected > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(expected, 10))
	}
	w.Header().Set("X-Relay-Status", statusHeader("upstream", "", 0, expected))
	// A trailer carries the *final* byte count — unknowable before the body
	// streams. Trailers require a chunked response, so they are only possible
	// when the upstream did not declare a length (otherwise Content-Length
	// pins the framing). When a length *is* declared, the client's own read
	// detects truncation and the JSON log line carries the diagnosis.
	canTrailer := expected == 0
	if canTrailer {
		w.Header().Set("Trailer", "X-Relay-Status")
	}

	statusOut := res.StatusCode
	if normaliseToWhole {
		statusOut = http.StatusOK
	}
	w.WriteHeader(statusOut)
	if r.Method == http.MethodHead {
		return
	}

	var tee *cache.Writer
	if wholeFile {
		if writer, err := h.cache.Begin(trackID, contentType); err == nil {
			tee = writer
		}
	}

	relayed, streamErr := h.pump(w, res.Body, tee, expected)
	if tee != nil {
		if streamErr == nil && relayed == expected {
			if err := tee.Finish(); err != nil {
				h.logLine("cache_write_failed", trackID, relayed, expected, err)
			}
		} else {
			// A truncated body must never be promoted into the cache: a
			// durable half-file would poison every later play.
			tee.Abort()
		}
	}
	if streamErr != nil {
		// The response is already committed, so there is no status code left
		// to change. Record the truth for the operator and end cleanly.
		h.logLine("upstream_died", trackID, relayed, expected, streamErr)
		if canTrailer {
			w.Header().Set("X-Relay-Status", statusHeader("upstream", "upstream_died", relayed, expected))
		}
		return
	}
	if canTrailer {
		w.Header().Set("X-Relay-Status", statusHeader("upstream", "", relayed, expected))
	}
}

// ── upstream opening ──────────────────────────────────────────

// bytesFromStart is the range the relay asks for when the client asked for
// nothing. See the note in serveUpstream: an unbounded request to a
// range-gated CDN URL is answered with a stall or a 403.
const bytesFromStart = "bytes=0-"

// Errors that distinguish *how* opening an upstream failed, so the caller can
// answer with the right status instead of one generic gateway failure.
var (
	errResolveFailed       = errors.New("resolve_failed")
	errResolvedURLExpired  = errors.New("resolved_url_expired")
	errUpstreamUnreachable = errors.New("upstream_unreachable")
)

// upstreamStatusError carries the CDN's own status through the layers.
type upstreamStatusError struct{ Status int }

func (e upstreamStatusError) Error() string { return "status " + strconv.Itoa(e.Status) }

func acceptableUpstream(status int) bool {
	return status == http.StatusOK || status == http.StatusPartialContent
}

// openUpstream resolves, fetches, and re-mints once when the CDN refuses.
//
// The refusal this exists for is the ordinary one: a resolved URL is signed for
// a window and sometimes bound to the address that asked, so it can be refused
// even though extraction worked. A blind retry would not help — the URL is the
// problem, not the moment — so the retry is a *fresh resolution*. This is what
// makes the relay behave like the server's direct tier instead of being the one
// path that gives up on the first 403.
func (h *Handler) openUpstream(ctx context.Context, trackID, upstreamRange string) (*http.Response, resolver.Result, error) {
	resolved, err := h.resolver.Resolve(ctx, trackID)
	if err != nil {
		return nil, resolver.Result{}, errors.Join(errResolveFailed, err)
	}
	if resolved.Expired() {
		return nil, resolved, errResolvedURLExpired
	}

	res, err := h.fetch(ctx, resolved.URL, upstreamRange)
	if err == nil && acceptableUpstream(res.StatusCode) {
		return res, resolved, nil
	}
	refused := 0
	if err == nil {
		refused = res.StatusCode
		res.Body.Close()
	}

	fresh, freshErr := h.resolver.ResolveFresh(ctx, trackID)
	if freshErr != nil {
		if err != nil {
			return nil, resolved, errors.Join(errUpstreamUnreachable, err)
		}
		return nil, resolved, upstreamStatusError{Status: refused}
	}

	retry, retryErr := h.fetch(ctx, fresh.URL, upstreamRange)
	if retryErr != nil {
		return nil, fresh, errors.Join(errUpstreamUnreachable, retryErr)
	}
	if acceptableUpstream(retry.StatusCode) {
		// Worth a line of its own: "the second URL worked" is the evidence that
		// re-minting is doing its job rather than hiding a failing track.
		h.logLine("upstream_reminted", trackID, 0, 0, nil)
		return retry, fresh, nil
	}
	status := retry.StatusCode
	retry.Body.Close()
	return nil, fresh, upstreamStatusError{Status: status}
}

func (h *Handler) fetch(ctx context.Context, upstreamURL, upstreamRange string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, upstreamURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", h.cfg.UserAgent)
	if upstreamRange != "" {
		req.Header.Set("Range", upstreamRange)
	}
	return h.upstream.Do(req)
}

// reportUpstreamFailure turns an opening failure into a response, with the
// diagnosis in the status header and one log line.
func (h *Handler) reportUpstreamFailure(w http.ResponseWriter, trackID string, err error) {
	var statusErr upstreamStatusError
	switch {
	case errors.Is(err, errResolvedURLExpired):
		h.logLine("resolved_url_expired", trackID, 0, 0, nil)
		writeStatusError(w, http.StatusBadGateway, "resolved_url_expired")
	case errors.As(err, &statusErr):
		h.logLine("upstream_status", trackID, 0, 0, statusErr)
		writeStatusError(w, http.StatusBadGateway, "upstream_status_"+strconv.Itoa(statusErr.Status))
	case errors.Is(err, errResolveFailed):
		if errors.Is(err, context.DeadlineExceeded) {
			h.logLine("resolve_timeout", trackID, 0, 0, err)
			writeStatusError(w, http.StatusGatewayTimeout, "resolve_timeout")
			return
		}
		h.logLine("resolve_failed", trackID, 0, 0, err)
		writeStatusError(w, http.StatusBadGateway, "resolve_failed")
	default:
		h.logLine("upstream_unreachable", trackID, 0, 0, err)
		writeStatusError(w, http.StatusBadGateway, "upstream_unreachable")
	}
}

// pump copies the body to the client, optionally duplicating every byte into
// the cache tee. It returns the bytes written and the first error, which is
// either an upstream read failure or a client write failure — both are
// terminal for this response.
func (h *Handler) pump(w http.ResponseWriter, src io.Reader, tee *cache.Writer, expected int64) (int64, error) {
	buf := make([]byte, copyBufferSize)
	var relayed int64
	for {
		n, readErr := src.Read(buf)
		if n > 0 {
			chunk := buf[:n]
			if tee != nil {
				if _, teeErr := tee.Write(chunk); teeErr != nil {
					// Losing the cache is survivable; losing the stream is not.
					tee.Abort()
					tee = nil
				}
			}
			written, writeErr := w.Write(chunk)
			relayed += int64(written)
			if writeErr != nil {
				return relayed, writeErr
			}
			if flu, ok := w.(http.Flusher); ok {
				// Media players start on the first frames, not the last byte.
				flu.Flush()
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return relayed, nil
			}
			return relayed, readErr
		}
	}
}

// ── helpers ───────────────────────────────────────────────────

func (h *Handler) logLine(event, trackID string, relayed, expected int64, err error) {
	record := map[string]any{
		"event":   event,
		"track":   trackID,
		"relayed": relayed,
	}
	if expected > 0 {
		record["expected"] = expected
	}
	if err != nil {
		record["error"] = err.Error()
	}
	payload, marshalErr := json.Marshal(record)
	if marshalErr != nil {
		return
	}
	// One line per stream outcome — grep-able, and never a stack trace.
	level := slog.LevelInfo
	if event != "upstream_died" && err != nil {
		level = slog.LevelWarn
	}
	h.log.Log(context.Background(), level, string(payload))
}

// statusHeader renders the stable, coarse diagnostics contract:
// `ok` or `error=<reason>`, then `source`, `relayed`, and `expected`.
func statusHeader(source, errReason string, relayed, expected int64) string {
	parts := make([]string, 0, 4)
	if errReason != "" {
		parts = append(parts, "error="+errReason)
	} else {
		parts = append(parts, "ok")
	}
	if source != "" {
		parts = append(parts, "source="+source)
	}
	parts = append(parts, "relayed="+strconv.FormatInt(relayed, 10))
	if expected > 0 {
		parts = append(parts, "expected="+strconv.FormatInt(expected, 10))
	}
	return strings.Join(parts, ";")
}

func contentLength(res *http.Response) int64 {
	if res.ContentLength > 0 {
		return res.ContentLength
	}
	if raw := res.Header.Get("Content-Length"); raw != "" {
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil {
			return n
		}
	}
	// A 206 answers with Content-Range: bytes START-END/TOTAL. The body
	// length is END-START+1, and knowing it is what makes the tee's
	// completeness check meaningful.
	if start, end, ok := parseContentRange(res.Header.Get("Content-Range")); ok && end >= start {
		return end - start + 1
	}
	return 0
}

func parseContentRange(header string) (int64, int64, bool) {
	start, end, _, ok := parseContentRangeFull(header)
	return start, end, ok
}

// parseContentRangeFull reads `bytes START-END/TOTAL` in full. The total is
// what tells a complete 206 apart from a capped one.
func parseContentRangeFull(header string) (start, end, total int64, ok bool) {
	rest, found := strings.CutPrefix(strings.TrimSpace(header), "bytes ")
	if !found {
		return 0, 0, 0, false
	}
	span, totalRaw, found := strings.Cut(rest, "/")
	if !found {
		return 0, 0, 0, false
	}
	startRaw, endRaw, found := strings.Cut(span, "-")
	if !found {
		return 0, 0, 0, false
	}
	s, err1 := strconv.ParseInt(strings.TrimSpace(startRaw), 10, 64)
	e, err2 := strconv.ParseInt(strings.TrimSpace(endRaw), 10, 64)
	t, err3 := strconv.ParseInt(strings.TrimSpace(totalRaw), 10, 64)
	if err1 != nil || err2 != nil || err3 != nil {
		return 0, 0, 0, false
	}
	return s, e, t, true
}

// spansWholeFile reports whether a Content-Range covers the entire file:
// `bytes 0-<size-1>/<size>`.
func spansWholeFile(header string) bool {
	start, end, total, ok := parseContentRangeFull(header)
	return ok && start == 0 && total > 0 && end == total-1
}

func copyHeader(dst, src http.Header, key string) {
	if v := src.Get(key); v != "" {
		dst.Set(key, v)
	}
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// writeStatusError answers a request that failed *before* any body byte was
// committed, so a status code is still available to the caller.
func writeStatusError(w http.ResponseWriter, status int, reason string) {
	w.Header().Set("X-Relay-Status", statusHeader("", reason, 0, 0))
	writeJSON(w, status, map[string]string{"error": reason})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// recover turns a bug into a diagnosable response instead of a dropped
// connection. The relay must never be the reason a track will not play.
func (h *Handler) recover(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				h.log.Log(context.Background(), slog.LevelError, "relay panicked",
					"path", r.URL.Path, "panic", fmt.Sprint(rec))
				// Headers may already be sent; writing again only logs in
				// net/http, which is preferable to a silent truncation.
				writeStatusError(w, http.StatusInternalServerError, "internal_error")
			}
		}()
		next(w, r)
	}
}
