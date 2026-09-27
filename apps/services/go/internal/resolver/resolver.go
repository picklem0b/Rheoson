// Package resolver turns a track id into a playable media URL.
//
// The relay deliberately does not know how to resolve anything itself: that
// knowledge lives in the engine (yt-dlp direct URLs) or the server (local
// files). Keeping the boundary at one HTTP call is what lets either side
// change without touching the hot path.
package resolver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrUnavailable is returned when no resolver is configured — the caller
// should fall back to its own byte service rather than surface a 500.
var ErrUnavailable = errors.New("relay resolver not configured")

// Result is one resolved track.
type Result struct {
	URL         string `json:"url"`
	ContentType string `json:"contentType"`
	// ExpiresAt is a Unix timestamp in seconds, 0 when the URL does not expire.
	ExpiresAt int64 `json:"expiresAt"`
	// Filename is a hint for the diag header only; never trusted for paths.
	Filename string `json:"filename"`
}

// Expired reports whether the resolved URL is known to have lapsed.
func (r Result) Expired() bool {
	return r.ExpiresAt > 0 && time.Now().Unix() >= r.ExpiresAt
}

// Resolver queries a base URL for direct media URLs.
type Resolver struct {
	base   string
	token  string
	client *http.Client
}

// New builds a resolver. A base of "" yields a resolver that always returns
// ErrUnavailable, so the relay can be started standalone for health checks.
func New(base, token string, timeout time.Duration) *Resolver {
	return &Resolver{
		base:   strings.TrimRight(base, "/"),
		token:  token,
		client: &http.Client{Timeout: timeout},
	}
}

// Configured reports whether a resolver base URL is set.
func (r *Resolver) Configured() bool { return r != nil && r.base != "" }

// Resolve asks the resolver for a track's media URL.
//
// The resolver is allowed to answer from its own cache; that is what makes a
// replay cheap. Use ResolveFresh after the CDN has refused the URL it gave.
func (r *Resolver) Resolve(ctx context.Context, trackID string) (Result, error) {
	return r.resolve(ctx, trackID, false)
}

// ResolveFresh asks for a URL the resolver must not serve from its cache.
//
// This matters because the engine caches direct URLs for hours: after the CDN
// refuses one, a plain re-resolve returns the same dead URL, so a caller's
// "re-mint and retry" would silently retry the thing that just failed. The
// freshness hint is the difference between a retry and a repeat.
func (r *Resolver) ResolveFresh(ctx context.Context, trackID string) (Result, error) {
	return r.resolve(ctx, trackID, true)
}

func (r *Resolver) resolve(ctx context.Context, trackID string, fresh bool) (Result, error) {
	if !r.Configured() {
		return Result{}, ErrUnavailable
	}
	endpoint := r.base + "/resolve/" + url.PathEscape(trackID)
	if fresh {
		endpoint += "?fresh=1"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Accept", "application/json")
	if r.token != "" {
		req.Header.Set("Authorization", "Bearer "+r.token)
	}
	res, err := r.client.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("resolver unreachable: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return Result{}, fmt.Errorf("resolver status %d", res.StatusCode)
	}
	var out Result
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return Result{}, fmt.Errorf("resolver body: %w", err)
	}
	if strings.TrimSpace(out.URL) == "" {
		return Result{}, errors.New("resolver returned no url")
	}
	if parsed, err := url.Parse(out.URL); err != nil || parsed.Scheme == "" {
		return Result{}, errors.New("resolver returned a non-absolute url")
	}
	return out, nil
}
