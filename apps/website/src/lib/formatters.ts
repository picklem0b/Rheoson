export function formatTotalDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0 min'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours} hr ${minutes} min`
  }

  return `${minutes} min`
}

// Format seconds to mm:ss or h:mm:ss
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Format bytes to human readable
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// Format a remaining-time estimate for a transfer (e.g. "2 min left")
//
// Deliberately coarse: a download that reports "1.4 seconds" is noise, not
// information, and second-by-second jitter reads as instability. Under a
// minute we say "<1 min" for the same reason.
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds) || seconds < 0) return ''
  if (seconds < 60) return '<1 min left'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min left`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} hr ${rest} min left` : `${hours} hr left`
}

// Format a transfer rate (bytes/second) to human readable
export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond == null || isNaN(bytesPerSecond) || bytesPerSecond <= 0) return ''
  return `${formatFileSize(bytesPerSecond)}/s`
}

// Format a date to relative time (e.g. "2 days ago")
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diff < 60)    return 'Just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800)return `${Math.floor(diff / 86400)}d ago`

  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Format large numbers (e.g. 1200 -> 1.2K)
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// Format track count label
export function formatTrackCount(n: number): string {
  return `${n} ${n === 1 ? 'track' : 'tracks'}`
}

// Truncate text with ellipsis
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max).trimEnd() + '…'
}

// Capitalize first letter
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}