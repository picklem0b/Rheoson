// Package cache is the relay's disk tee: whole-file responses land here so a
// replay flow never touches the CDN again.
//
// The cache is a *cache*, not a library: every entry is re-derivable from the
// resolver, so a partial write is discarded rather than resumed. Writes go to
// `<track>.part` and are renamed into place only when the whole file streamed
// successfully — a reader never observes a truncated entry.
package cache

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// ErrDisabled is returned when no cache directory is configured.
var ErrDisabled = errors.New("relay cache disabled")

var trackIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// safeTrackID rejects anything that could escape the cache directory. Track
// ids reach the relay from an HTTP query parameter, so traversal must be
// impossible rather than merely unlikely.
func safeTrackID(id string) bool { return trackIDPattern.MatchString(id) }

// Entry is a cached file plus the metadata a response needs.
type Entry struct {
	Path        string
	Size        int64
	ContentType string
}

type meta struct {
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
}

// Cache is a concurrency-safe disk tee.
type Cache struct {
	dir string
	mu  sync.Mutex
}

// New returns a cache rooted at dir. An empty dir yields a disabled cache
// whose Open always misses — callers need no branching.
func New(dir string) *Cache { return &Cache{dir: dir} }

// Enabled reports whether the cache will persist anything.
func (c *Cache) Enabled() bool { return c != nil && c.dir != "" }

func (c *Cache) path(trackID, suffix string) string {
	return filepath.Join(c.dir, trackID+suffix)
}

// Open returns the cached entry for a track, or ok=false on a miss, a
// disabled cache, or an unsafe id.
func (c *Cache) Open(trackID string) (Entry, bool) {
	if !c.Enabled() || !safeTrackID(trackID) {
		return Entry{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	path := c.path(trackID, ".audio")
	info, err := os.Stat(path)
	if err != nil || info.IsDir() || info.Size() == 0 {
		return Entry{}, false
	}
	entry := Entry{Path: path, Size: info.Size(), ContentType: "audio/mpeg"}
	if raw, err := os.ReadFile(c.path(trackID, ".meta.json")); err == nil {
		var m meta
		if json.Unmarshal(raw, &m) == nil {
			if m.ContentType != "" {
				entry.ContentType = m.ContentType
			}
			// The file on disk is truth; a stale sidecar size must not
			// desync a Content-Length header.
			entry.Size = info.Size()
		}
	}
	return entry, true
}

// Begin opens a staging writer for a track. Callers must Finish or Abort it.
func (c *Cache) Begin(trackID, contentType string) (*Writer, error) {
	if !c.Enabled() || !safeTrackID(trackID) {
		return nil, ErrDisabled
	}
	if err := os.MkdirAll(c.dir, 0o755); err != nil {
		return nil, err
	}
	f, err := os.Create(c.path(trackID, ".part"))
	if err != nil {
		return nil, err
	}
	return &Writer{c: c, trackID: trackID, contentType: contentType, file: f}, nil
}

// Writer stages a file into the cache.
type Writer struct {
	c           *Cache
	trackID     string
	contentType string
	file        *os.File
	written     int64
	closed      bool
}

// Write appends to the staged file.
func (w *Writer) Write(p []byte) (int, error) {
	n, err := w.file.Write(p)
	w.written += int64(n)
	return n, err
}

// Written is the number of bytes staged so far.
func (w *Writer) Written() int64 { return w.written }

// Finish promotes the staged file into the cache. A zero-byte stage is
// aborted: an empty entry would poison future reads.
func (w *Writer) Finish() error {
	if w.closed {
		return nil
	}
	w.closed = true
	if err := w.file.Close(); err != nil {
		w.discard()
		return err
	}
	if w.written == 0 {
		w.discard()
		return errors.New("empty body")
	}
	c := w.c
	c.mu.Lock()
	defer c.mu.Unlock()

	if err := os.Rename(c.path(w.trackID, ".part"), c.path(w.trackID, ".audio")); err != nil {
		c.discardLocked(w.trackID)
		return err
	}
	payload, _ := json.Marshal(meta{ContentType: w.contentType, Size: w.written})
	if err := os.WriteFile(c.path(w.trackID, ".meta.json"), payload, 0o644); err != nil {
		// The media file is the valuable artifact; a missing sidecar only
		// costs a guessed content type on the next read.
		_ = err
	}
	return nil
}

// Abort discards the staged file. Safe to call after Finish.
func (w *Writer) Abort() {
	if w.closed {
		return
	}
	w.closed = true
	_ = w.file.Close()
	w.discard()
}

func (w *Writer) discard() {
	w.c.mu.Lock()
	defer w.c.mu.Unlock()
	w.c.discardLocked(w.trackID)
}

func (c *Cache) discardLocked(trackID string) {
	_ = os.Remove(c.path(trackID, ".part"))
}

// Stats summarises the cache for the health endpoint.
type Stats struct {
	Tracks int
	Bytes  int64
}

// Stats walks the cache directory. A missing directory is zero, not an error:
// nothing has been teed yet.
func (c *Cache) Stats() Stats {
	if !c.Enabled() {
		return Stats{}
	}
	entries, err := os.ReadDir(c.dir)
	if err != nil {
		return Stats{}
	}
	var s Stats
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".audio") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		s.Tracks++
		s.Bytes += info.Size()
	}
	return s
}
