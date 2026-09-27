package relay

import "testing"

func TestParseRange(t *testing.T) {
	cases := []struct {
		name  string
		head  string
		want  ByteRange
		valid bool
	}{
		{"empty", "", ByteRange{}, false},
		{"bounded", "bytes=100-200", ByteRange{Start: 100, End: 200}, true},
		{"open ended", "bytes=1024-", ByteRange{Start: 1024}, true},
		{"suffix", "bytes=-512", ByteRange{Start: 512, Suffix: true}, true},
		{"zero open", "bytes=0-", ByteRange{Start: 0}, true},
		{"multi range", "bytes=0-10,20-30", ByteRange{}, false},
		{"wrong unit", "items=0-10", ByteRange{}, false},
		{"no dash", "bytes=100", ByteRange{}, false},
		{"end before start", "bytes=200-100", ByteRange{}, false},
		{"negative start", "bytes=-100-200", ByteRange{}, false},
		{"suffix zero", "bytes=-0", ByteRange{}, false},
		{"non numeric", "bytes=abc-def", ByteRange{}, false},
	}
	for _, tc := range cases {
		got, ok := ParseRange(tc.head)
		if ok != tc.valid {
			t.Fatalf("%s: validity = %v, want %v", tc.name, ok, tc.valid)
		}
		if !tc.valid {
			continue
		}
		if got != tc.want {
			t.Fatalf("%s: parsed = %+v, want %+v", tc.name, got, tc.want)
		}
	}
}

func TestIsWholeFile(t *testing.T) {
	// Only whole-file requests may seed the cache tee: a partial response
	// never carries a complete, reusable file.
	cases := map[string]bool{
		"":            true,
		"bytes=0-":    true,
		"bytes=0-0":   true,
		"bytes=1-":    false,
		"bytes=100-":  false,
		"bytes=-512":  false,
		"bytes=0-999": false,
		"garbage":     true,
	}
	for header, want := range cases {
		if got := IsWholeFile(header); got != want {
			t.Fatalf("IsWholeFile(%q) = %v, want %v", header, got, want)
		}
	}
}

func TestContentRange(t *testing.T) {
	if got := ContentRange(0, 1023, 4096); got != "bytes 0-1023/4096" {
		t.Fatalf("ContentRange = %q", got)
	}
}
