package cache

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFinishPromotesEntry(t *testing.T) {
	dir := t.TempDir()
	c := New(dir)

	w, err := c.Begin("abc123", "audio/webm")
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if _, err := w.Write([]byte("sound")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if err := w.Finish(); err != nil {
		t.Fatalf("Finish: %v", err)
	}

	entry, ok := c.Open("abc123")
	if !ok {
		t.Fatal("expected a cache hit after Finish")
	}
	if entry.Size != 5 {
		t.Fatalf("size = %d, want 5", entry.Size)
	}
	if entry.ContentType != "audio/webm" {
		t.Fatalf("contentType = %q", entry.ContentType)
	}
	if _, err := os.Stat(filepath.Join(dir, "abc123.part")); !os.IsNotExist(err) {
		t.Fatalf("staging file should be gone, stat err = %v", err)
	}
}

func TestAbortLeavesNoEntry(t *testing.T) {
	c := New(t.TempDir())
	w, err := c.Begin("abc123", "audio/mpeg")
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if _, err := w.Write([]byte("half")); err != nil {
		t.Fatalf("Write: %v", err)
	}
	w.Abort()

	if _, ok := c.Open("abc123"); ok {
		t.Fatal("aborted stage must not be readable")
	}
}

func TestFinishDiscardsEmptyStage(t *testing.T) {
	c := New(t.TempDir())
	w, err := c.Begin("abc123", "audio/mpeg")
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if err := w.Finish(); err == nil {
		t.Fatal("expected an error promoting a zero-byte stage")
	}
	if _, ok := c.Open("abc123"); ok {
		t.Fatal("empty entry must not be readable")
	}
}

func TestUnsafeTrackIDsAreRejected(t *testing.T) {
	c := New(t.TempDir())
	for _, id := range []string{"../escape", "a/b", "", "with space", "semi;colon", ".hidden"} {
		if _, err := c.Begin(id, "audio/mpeg"); err == nil {
			t.Fatalf("Begin(%q) should be rejected", id)
		}
		if _, ok := c.Open(id); ok {
			t.Fatalf("Open(%q) should miss", id)
		}
	}
}

func TestDisabledCacheNeverHits(t *testing.T) {
	c := New("")
	if c.Enabled() {
		t.Fatal("empty dir should disable the cache")
	}
	if _, ok := c.Open("abc123"); ok {
		t.Fatal("disabled cache must not hit")
	}
	if _, err := c.Begin("abc123", "audio/mpeg"); err != ErrDisabled {
		t.Fatalf("Begin err = %v, want ErrDisabled", err)
	}
	if stats := c.Stats(); stats.Tracks != 0 || stats.Bytes != 0 {
		t.Fatalf("Stats = %+v, want zero", stats)
	}
}

func TestStatsCountsPromotedFiles(t *testing.T) {
	c := New(t.TempDir())
	for _, id := range []string{"one", "two"} {
		w, err := c.Begin(id, "audio/mpeg")
		if err != nil {
			t.Fatalf("Begin(%s): %v", id, err)
		}
		if _, err := w.Write([]byte("12345678")); err != nil {
			t.Fatalf("Write: %v", err)
		}
		if err := w.Finish(); err != nil {
			t.Fatalf("Finish: %v", err)
		}
	}
	stats := c.Stats()
	if stats.Tracks != 2 || stats.Bytes != 16 {
		t.Fatalf("Stats = %+v, want 2 tracks / 16 bytes", stats)
	}
}
