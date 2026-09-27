package relay

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rheoson/relay/internal/cache"
	"github.com/rheoson/relay/internal/config"
	"github.com/rheoson/relay/internal/resolver"
)

// newTestRelay wires a handler against a resolver that points at the given
// media URL. A mediaURL of "" leaves the resolver unconfigured.
func newTestRelay(t *testing.T, mediaURL string, token string, withCache bool) (*httptest.Server, *cache.Cache) {
	t.Helper()
	srv, c, _ := newTestRelayWithLog(t, mediaURL, token, withCache)
	return srv, c
}

func newTestRelayWithLog(t *testing.T, mediaURL string, token string, withCache bool) (*httptest.Server, *cache.Cache, *bytes.Buffer) {
	t.Helper()
	cacheDir := ""
	var c *cache.Cache
	if withCache {
		cacheDir = t.TempDir()
		c = cache.New(cacheDir)
	} else {
		c = cache.New("")
	}

	resolverURL := ""
	if mediaURL != "" {
		rs := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"url": mediaURL})
		}))
		t.Cleanup(rs.Close)
		resolverURL = rs.URL
	}

	cfg := config.Config{
		Port:            0,
		CacheDir:        cacheDir,
		ResolverURL:     resolverURL,
		Token:           token,
		UserAgent:       config.DefaultUserAgent,
		ResolveTimeout:  5 * time.Second,
		UpstreamTimeout: 5 * time.Second,
	}
	logs := &bytes.Buffer{}
	handler := NewHandler(cfg, resolver.New(cfg.ResolverURL, token, cfg.ResolveTimeout), c,
		slog.New(slog.NewJSONHandler(logs, nil)))
	srv := httptest.NewServer(handler.Routes())
	t.Cleanup(srv.Close)
	return srv, c, logs
}

func TestHealthReportsConfig(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	t.Cleanup(upstream.Close)

	srv, _ := newTestRelay(t, upstream.URL, "", true)
	res, err := http.Get(srv.URL + "/relay/health")
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", res.StatusCode)
	}
	var payload healthPayload
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.Status != "ok" || !payload.ResolverConfigured || !payload.CacheEnabled {
		t.Fatalf("payload = %+v", payload)
	}
}

func TestMissingTrackIsBadRequest(t *testing.T) {
	srv, _ := newTestRelay(t, "", "", false)
	res, err := http.Get(srv.URL + "/relay/audio")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", res.StatusCode)
	}
	if got := res.Header.Get("X-Relay-Status"); !strings.Contains(got, "error=missing_track") {
		t.Fatalf("status header = %q", got)
	}
}

func TestUnconfiguredResolverIsServiceUnavailable(t *testing.T) {
	srv, _ := newTestRelay(t, "", "", false)
	res, err := http.Get(srv.URL + "/relay/audio?track=abc")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer res.Body.Close()
	// 503 is the fallback signal: the server serves bytes itself rather than
	// surfacing a broken play to the user.
	if res.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", res.StatusCode)
	}
}

func TestTokenIsEnforcedWhenConfigured(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("sound"))
	}))
	t.Cleanup(upstream.Close)

	srv, _ := newTestRelay(t, upstream.URL, "secret", false)

	res, err := http.Get(srv.URL + "/relay/audio?track=abc")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want 401", res.StatusCode)
	}

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/relay/audio?track=abc", nil)
	req.Header.Set("Authorization", "Bearer secret")
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("authorized get: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("authorized status = %d, want 200", res.StatusCode)
	}
}

func TestUpstreamRangeIsForwardedVerbatim(t *testing.T) {
	payload := []byte("0123456789abcdefghij")
	var seenRange atomic.Value
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenRange.Store(r.Header.Get("Range"))
		if r.Header.Get("Range") == "" {
			w.Header().Set("Content-Length", "20")
			_, _ = w.Write(payload)
			return
		}
		// Echo a real 206 like a byte-range-capable CDN would.
		w.Header().Set("Content-Range", "bytes 4-9/20")
		w.Header().Set("Content-Length", "6")
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write(payload[4:10])
	}))
	t.Cleanup(upstream.Close)

	srv, _ := newTestRelay(t, upstream.URL, "", false)
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/relay/audio?track=abc", nil)
	req.Header.Set("Range", "bytes=4-9")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer res.Body.Close()

	if got := seenRange.Load().(string); got != "bytes=4-9" {
		t.Fatalf("upstream saw Range %q, want it forwarded verbatim", got)
	}
	if res.StatusCode != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206", res.StatusCode)
	}
	if got := res.Header.Get("Content-Range"); got != "bytes 4-9/20" {
		t.Fatalf("Content-Range = %q", got)
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != "456789" {
		t.Fatalf("body = %q", body)
	}
}

func TestWholeFileGetsTeeAndSecondPlayHitsCache(t *testing.T) {
	payload := []byte("complete-track-bytes")
	var upstreamCalls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls.Add(1)
		w.Header().Set("Content-Type", "audio/ogg")
		w.Header().Set("Content-Length", "20")
		_, _ = w.Write(payload)
	}))
	t.Cleanup(upstream.Close)

	srv, c := newTestRelay(t, upstream.URL, "", true)

	for play := 1; play <= 2; play++ {
		res, err := http.Get(srv.URL + "/relay/audio?track=abc123")
		if err != nil {
			t.Fatalf("play %d: %v", play, err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if string(body) != string(payload) {
			t.Fatalf("play %d body = %q", play, body)
		}
		if play == 1 && !strings.Contains(res.Header.Get("X-Relay-Status"), "source=upstream") {
			t.Fatalf("first play should be sourced upstream, got %q", res.Header.Get("X-Relay-Status"))
		}
		if play == 2 && !strings.Contains(res.Header.Get("X-Relay-Status"), "source=cache") {
			t.Fatalf("second play should be sourced from cache, got %q", res.Header.Get("X-Relay-Status"))
		}
	}

	if got := upstreamCalls.Load(); got != 1 {
		t.Fatalf("upstream called %d times, want 1 — the tee did not serve the replay", got)
	}
	entry, ok := c.Open("abc123")
	if !ok {
		t.Fatal("expected a promoted cache entry")
	}
	if entry.ContentType != "audio/ogg" {
		t.Fatalf("cached contentType = %q", entry.ContentType)
	}
}

func TestRangeRequestIsNotTeeIntoCache(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Range", "bytes 0-3/100")
		w.Header().Set("Content-Length", "4")
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write([]byte("head"))
	}))
	t.Cleanup(upstream.Close)

	srv, c := newTestRelay(t, upstream.URL, "", true)
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/relay/audio?track=abc123", nil)
	req.Header.Set("Range", "bytes=0-3")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	res.Body.Close()

	if _, ok := c.Open("abc123"); ok {
		t.Fatal("a partial response must never seed the cache")
	}
}

func TestUpstreamDeathEndsResponseAndIsReported(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Promise 1000 bytes, deliver 10, then die — exactly how a CDN edge
		// dropping a connection looks to a client.
		w.Header().Set("Content-Length", "1000")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("0123456789"))
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}
		panic(http.ErrAbortHandler)
	}))
	t.Cleanup(upstream.Close)

	srv, c, logs := newTestRelayWithLog(t, upstream.URL, "", true)
	res, err := http.Get(srv.URL + "/relay/audio?track=abc123")
	if err != nil {
		t.Fatalf("the relay must not raise on upstream death: %v", err)
	}
	defer res.Body.Close()

	// The response was already committed, so the status stays 200 and the
	// client detects the truncation itself. The response still ends cleanly:
	// no panic, no dangling connection.
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want the committed 200", res.StatusCode)
	}
	body, readErr := io.ReadAll(res.Body)
	if readErr == nil || !strings.Contains(readErr.Error(), "unexpected EOF") {
		t.Fatalf("expected a truncated body, got %d bytes and err=%v", len(body), readErr)
	}
	if !strings.Contains(logs.String(), "upstream_died") {
		t.Fatalf("expected a one-line upstream_died report, logs = %s", logs.String())
	}
	if _, ok := c.Open("abc123"); ok {
		t.Fatal("a truncated stream must never be promoted into the cache")
	}
}

func TestChunkedUpstreamReportsFinalStatusInTrailer(t *testing.T) {
	// With no Content-Length the response is chunked, so the exact byte count
	// can be delivered in a trailer after the body.
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Transfer-Encoding", "chunked")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("twelve bytes"))
	}))
	t.Cleanup(upstream.Close)

	srv, _ := newTestRelay(t, upstream.URL, "", true)
	res, err := http.Get(srv.URL + "/relay/audio?track=abc123")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)

	if string(body) != "twelve bytes" {
		t.Fatalf("body = %q", body)
	}
	if got := res.Trailer.Get("X-Relay-Status"); !strings.Contains(got, "relayed=12") {
		t.Fatalf("trailer = %q, want the exact relayed count", got)
	}
}

func TestUpstreamErrorStatusBecomesBadGateway(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	t.Cleanup(upstream.Close)

	srv, _ := newTestRelay(t, upstream.URL, "", false)
	res, err := http.Get(srv.URL + "/relay/audio?track=abc")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", res.StatusCode)
	}
	if got := res.Header.Get("X-Relay-Status"); !strings.Contains(got, "upstream_status_403") {
		t.Fatalf("status header = %q", got)
	}
}

func TestHeadReturnsHeadersWithoutBody(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "audio/mpeg")
		w.Header().Set("Content-Length", "128")
		_, _ = w.Write(make([]byte, 128))
	}))
	t.Cleanup(upstream.Close)

	srv, _ := newTestRelay(t, upstream.URL, "", false)
	req, _ := http.NewRequest(http.MethodHead, srv.URL+"/relay/audio?track=abc", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("head: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", res.StatusCode)
	}
	body, _ := io.ReadAll(res.Body)
	if len(body) != 0 {
		t.Fatalf("HEAD body = %d bytes, want 0", len(body))
	}
	if res.Header.Get("Content-Type") != "audio/mpeg" {
		t.Fatalf("content-type = %q", res.Header.Get("Content-Type"))
	}
}

func TestCachedEntrySupportsRanges(t *testing.T) {
	payload := []byte("0123456789abcdefghij")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "20")
		_, _ = w.Write(payload)
	}))
	t.Cleanup(upstream.Close)

	srv, _ := newTestRelay(t, upstream.URL, "", true)
	first, err := http.Get(srv.URL + "/relay/audio?track=abc123")
	if err != nil {
		t.Fatalf("warm: %v", err)
	}
	first.Body.Close()

	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/relay/audio?track=abc123", nil)
	req.Header.Set("Range", "bytes=5-9")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("ranged: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206 from the cache", res.StatusCode)
	}
	body, _ := io.ReadAll(res.Body)
	if string(body) != "56789" {
		t.Fatalf("body = %q", body)
	}
	if !strings.Contains(res.Header.Get("X-Relay-Status"), "source=cache") {
		t.Fatalf("status header = %q", res.Header.Get("X-Relay-Status"))
	}
}

func TestMethodNotAllowed(t *testing.T) {
	srv, _ := newTestRelay(t, "", "", false)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/relay/audio?track=abc", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", res.StatusCode)
	}
}
