type Level = 'info' | 'warn' | 'error'

/**
 * One JSON line per event.
 *
 * Workers logs are grep-able text, so a line carries the fields rather than
 * prose: a user quoting a request id lands on exactly that request.
 */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, message, ...fields, at: new Date().toISOString() })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`
}
