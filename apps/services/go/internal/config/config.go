// Package config holds the relay's environment contract.
//
// The relay is deliberately configurable by env only: it runs the same image
// in compose, in CI, and on a bare host, and the server discovers its
// behaviour at boot by reading these values out of the compose file.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the resolved runtime configuration.
type Config struct {
	// Port is the HTTP listen port.
	Port int
	// CacheDir is where whole-file tees and their sidecar metadata live.
	// Empty disables caching (pure pass-through).
	CacheDir string
	// ResolverURL is the base URL of whatever can turn a track id into a
	// playable media URL — the server in production, the py engine in the
	// decoupled layout. Empty makes /relay/audio a 503.
	ResolverURL string
	// Token is the shared service token presented to the resolver and
	// required from callers when RelayToken is set.
	Token string
	// UserAgent is forwarded upstream; some CDN edges reject bare clients.
	UserAgent string
	// ResolveTimeout bounds the resolver call (not the byte stream).
	ResolveTimeout time.Duration
	// UpstreamTimeout bounds time-to-first-byte from the CDN.
	UpstreamTimeout time.Duration
}

// DefaultUserAgent mirrors the engine's desktop UA string.
const DefaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

// Load reads configuration from the environment, applying defaults.
func Load() Config {
	return Config{
		Port:            envInt("RELAY_PORT", 8080),
		CacheDir:        strings.TrimSpace(os.Getenv("CACHE_DIR")),
		ResolverURL:     strings.TrimRight(strings.TrimSpace(os.Getenv("UPSTREAM_RESOLVER")), "/"),
		Token:           strings.TrimSpace(os.Getenv("RELAY_TOKEN")),
		UserAgent:       envStr("RELAY_USER_AGENT", DefaultUserAgent),
		ResolveTimeout:  envDuration("RELAY_RESOLVE_TIMEOUT", 20*time.Second),
		UpstreamTimeout: envDuration("RELAY_UPSTREAM_TIMEOUT", 20*time.Second),
	}
}

func envStr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return fallback
	}
	return d
}
