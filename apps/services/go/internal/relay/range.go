package relay

import (
	"strconv"
	"strings"
)

// ByteRange is the parsed first range of a `Range` header. Bounded requests
// carry both ends; `bytes=N-` leaves End unset; `bytes=-N` is a suffix.
type ByteRange struct {
	Start int64
	End   int64
	// Suffix is true for `bytes=-N`, where Start is the length asked for
	// from the end of the file rather than an offset.
	Suffix bool
}

// ParseRange reads a single-range `Range` header. It returns ok=false for a
// missing, multi-range, or malformed header — the relay then treats the
// request as a whole-file request, which is what a media player wants when it
// cannot express a range.
func ParseRange(header string) (ByteRange, bool) {
	header = strings.TrimSpace(header)
	if header == "" {
		return ByteRange{}, false
	}
	const prefix = "bytes="
	if !strings.HasPrefix(header, prefix) {
		return ByteRange{}, false
	}
	spec := strings.TrimSpace(strings.TrimPrefix(header, prefix))
	// Multi-range requests are legal HTTP but useless for audio playback;
	// serving the whole file is the honest response.
	if strings.Contains(spec, ",") {
		return ByteRange{}, false
	}
	startRaw, endRaw, found := strings.Cut(spec, "-")
	if !found {
		return ByteRange{}, false
	}
	if startRaw == "" {
		n, err := strconv.ParseInt(endRaw, 10, 64)
		if err != nil || n <= 0 {
			return ByteRange{}, false
		}
		return ByteRange{Start: n, Suffix: true}, true
	}
	start, err := strconv.ParseInt(startRaw, 10, 64)
	if err != nil || start < 0 {
		return ByteRange{}, false
	}
	r := ByteRange{Start: start}
	if endRaw != "" {
		end, err := strconv.ParseInt(endRaw, 10, 64)
		if err != nil || end < start {
			return ByteRange{}, false
		}
		r.End = end
	}
	return r, true
}

// IsWholeFile reports whether a request wants the entire entity. A missing
// header does; `bytes=0-` does; a suffix request for the whole length does.
// Only whole-file requests are eligible for the cache tee, because a partial
// response never carries a complete, reusable file.
func IsWholeFile(header string) bool {
	r, ok := ParseRange(header)
	if !ok {
		return true
	}
	if r.Suffix {
		// `bytes=-0` is malformed and already rejected; any suffix range
		// is by definition not the whole file from the start.
		return false
	}
	return r.Start == 0 && r.End == 0
}

// ContentRange renders the header the client expects for a 206 response.
func ContentRange(start, end, total int64) string {
	return "bytes " + strconv.FormatInt(start, 10) + "-" + strconv.FormatInt(end, 10) +
		"/" + strconv.FormatInt(total, 10)
}
