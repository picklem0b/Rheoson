/**
 * Formatting helpers — one implementation each, so a duration never renders
 * two different ways on two surfaces.
 */

/** `3:07`, or `1:02:44` past an hour. Negative and NaN read as `0:00`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds ?? NaN) || (seconds ?? 0) < 0) return '0:00';
  const total = Math.floor(seconds as number);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** Byte sizes in the units a person reads: `4.6 MB`, never `4865392`. */
export function formatBytes(bytes: number | null | undefined): string {
  const value = Number.isFinite(bytes ?? NaN) ? (bytes as number) : 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = value / 1024;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return `${scaled.toFixed(scaled >= 10 ? 0 : 1)} ${units[index]}`;
}

/** Transfer speed: `1.2 MB/s`. */
export function formatSpeed(bytesPerSecond: number | null | undefined): string | null {
  if (!bytesPerSecond || bytesPerSecond <= 0) return null;
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** `ETA 1:20`, or null when there is nothing honest to say. */
export function formatEta(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  return `ETA ${formatDuration(seconds)}`;
}

/**
 * A short date: `22 Sep`, with the year only when it is not the current one.
 *
 * Deliberately not `toLocaleDateString`: the app renders the same string on the
 * server and the client, and a locale-dependent format is how a hydration
 * mismatch appears.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const month = MONTHS[date.getUTCMonth()];
  const day = date.getUTCDate();
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return sameYear ? `${day} ${month}` : `${day} ${month} ${date.getUTCFullYear()}`;
}

/** `2 hours ago`, `3 days ago`, for history rows. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatShortDate(date);
}

/** Truncate a title for a single-line slot, without cutting mid-word. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
