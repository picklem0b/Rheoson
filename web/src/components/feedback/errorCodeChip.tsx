import { useState } from 'react'

/**
 * The code, in the one format a person can read out loud.
 *
 * Copying is the whole interaction: a code that reaches a log line is worth
 * more than a screenshot of an error screen.
 */
export function ErrorCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const label = `[ERROR_CODE: ${code}]`

  async function copy() {
    try {
      await navigator.clipboard.writeText(label)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* A browser without clipboard access still shows the code. */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Code copied' : `Copy error code ${code}`}
      className="rounded-xs border border-border bg-muted px-2 py-1 font-mono text-2xs text-muted-foreground hover:text-foreground"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
