/**
 * Diagnostics translation layer.
 *
 * The backend health probes are written for operators: `MUSIC_DIR:unavailable`,
 * `yt-dlp: missing`, `not connected`. That is the right shape for a log and the
 * wrong shape for the person holding the phone, who only knows that a song
 * will not play.
 *
 * This module turns each probe into three things:
 *   - what was reported, stated plainly
 *   - what it actually costs the user
 *   - the one action worth offering, if any exists
 *
 * Keeping this in one place means the Doctor screen has no per-check branching
 * of its own, and a new backend probe is a single entry here.
 */

import type { HealthCheck, HealthPayload, HealthStatus } from '@/api/health.api'
import { describeApiTarget, type ApiTargetSource } from '@/lib/constants'

export type Severity = 'ok' | 'warn' | 'bad' | 'unknown'

export type FixKind =
   | 'recheck'
   | 'deep'
   | 'selftest'
   | 'rescan'
   | 'update-tools'
   | 'clear-stream-cache'
   | 'clear-remote-cache'
   | 'open-storage'

export interface Fix {
   label: string
   kind: FixKind
}

export interface Finding {
   id: string
   title: string
   severity: Severity
   /** What the probe reported, in plain language. */
   detail: string
   /** What that means for someone trying to play music. */
   impact: string
   fix?: Fix
}

export function severityFor(status: HealthStatus): Severity {
   switch (status) {
      case 'passing':
         return 'ok'
      case 'degraded':
         return 'warn'
      case 'failing':
         return 'bad'
      default:
         return 'unknown'
   }
}

/** Worst severity in the list, for the summary banner. */
export function worstSeverity(findings: Finding[]): Severity {
   const rank: Record<Severity, number> = { ok: 0, unknown: 1, warn: 2, bad: 3 }
   let worst: Severity = 'ok'
   for (const f of findings) {
      if (rank[f.severity] > rank[worst]) worst = f.severity
   }
   return worst
}

function bytes(n: number | undefined): string {
   if (!n || n <= 0) return ''
   const units = ['B', 'KB', 'MB', 'GB', 'TB']
   let value = n
   let i = 0
   while (value >= 1024 && i < units.length - 1) {
      value /= 1024
      i += 1
   }
   return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function humanUptime(seconds: number | undefined): string {
   if (!seconds || seconds < 0) return ''
   const d = Math.floor(seconds / 86400)
   const h = Math.floor((seconds % 86400) / 3600)
   const m = Math.floor((seconds % 3600) / 60)
   if (d > 0) return `${d}d ${h}h`
   if (h > 0) return `${h}h ${m}m`
   return `${m}m`
}

// ── Per-check copy ────────────────────────────────────────────

function storageFinding(check: HealthCheck): Finding {
   const severity = severityFor(check.status)
   const free = bytes(check.diskFreeBytes)
   const files = check.audioFiles

   if (severity === 'ok') {
      const bits = [
         files != null ? `${files} audio file${files === 1 ? '' : 's'} indexed` : '',
         free ? `${free} free` : '',
      ].filter(Boolean)
      return {
         id: 'storage',
         title: 'Music folders',
         severity,
         detail: bits.length ? bits.join(' · ') : 'Present and writable',
         impact: 'Downloads land here, and this is where the library is read from.',
      }
   }

   return {
      id: 'storage',
      title: 'Music folders',
      severity,
      detail: check.detail ?? 'A folder is missing or not writable',
      impact:
         'Downloads will fail and part of your library may not appear. On Android this is usually a storage permission.',
      fix: { label: 'Open storage settings', kind: 'open-storage' },
   }
}

function mongodbFinding(check: HealthCheck): Finding {
   const severity = severityFor(check.status)

   if (severity === 'ok') {
      return {
         id: 'mongodb',
         title: 'Database',
         severity,
         detail:
            check.latencyMs != null
               ? `Connected · ${check.latencyMs} ms`
               : 'Connected',
         impact: 'Powers accounts, recommendations and listening stats.',
      }
   }

   if (severity === 'unknown') {
      return {
         id: 'mongodb',
         title: 'Database',
         severity,
         detail: check.detail ?? 'Not configured',
         impact:
            'Account-linked features are off in this setup. Playlists, likes, history and playback are unaffected.',
      }
   }

   return {
      id: 'mongodb',
      title: 'Database',
      severity,
      detail: check.detail ?? 'Not reachable',
      impact:
         'Playlists, likes, history and playback still work — they are stored as files. Recommendations, follows and listening stats will fail until it reconnects.',
   }
}

function binariesFinding(check: HealthCheck): Finding {
   const ytdlp = check.binaries?.ytdlp
   const ffmpeg = check.binaries?.ffmpeg
   const severity = severityFor(check.status)

   if (ytdlp && !ytdlp.present) {
      return {
         id: 'binaries',
         title: 'Media tools',
         severity: 'bad',
         detail: check.detail ?? 'yt-dlp is not installed on the server',
         impact:
            'Streaming a track that is not already downloaded, and downloading anything new, will not work. Install yt-dlp on the server to fix this.',
      }
   }

   if (ffmpeg && !ffmpeg.present) {
      return {
         id: 'binaries',
         title: 'Media tools',
         severity: 'warn',
         detail: check.detail ?? 'ffmpeg is missing',
         impact:
            'Playback works. Downloads keep the original format instead of being converted to your chosen one, and embedded artwork/lyrics may be skipped.',
      }
   }

   const parts = [
      ytdlp?.version ? `yt-dlp ${ytdlp.version}` : '',
      ffmpeg?.version ? `ffmpeg ${ffmpeg.version}` : '',
   ].filter(Boolean)

   return {
      id: 'binaries',
      title: 'Media tools',
      severity,
      detail: parts.join(' · ') || check.detail || 'Installed',
      impact:
         'A yt-dlp that has fallen behind YouTube is the most common reason a specific track refuses to play. Updating it is safe and takes a few seconds.',
      // Offered even when passing: staleness is exactly the failure this
      // probe cannot detect from a version string alone.
      fix: { label: 'Update yt-dlp', kind: 'update-tools' },
   }
}

function authFinding(check: HealthCheck): Finding {
   const severity = severityFor(check.status)

   if (severity === 'ok') {
      return {
         id: 'auth',
         title: 'Sign-in',
         severity,
         detail: 'Configured',
         impact: 'Accounts, follows and per-user recommendations are available.',
      }
   }

   if (severity === 'unknown') {
      return {
         id: 'auth',
         title: 'Sign-in',
         severity,
         detail: check.detail ?? 'Not configured',
         impact:
            'Sign-in is disabled in this setup. Everything except account-linked features works in guest mode.',
      }
   }

   return {
      id: 'auth',
      title: 'Sign-in',
      severity,
      detail: check.detail ?? 'Sign-in keys missing',
      impact:
         'Nobody can sign in, so the app runs in guest mode. Playlists, likes and playback still work; recommendations and stats do not.',
   }
}

function configFinding(check: HealthCheck): Finding {
   const severity = severityFor(check.status)

   if (severity === 'ok') {
      return {
         id: 'config',
         title: 'Server configuration',
         severity,
         detail: check.env ? `Valid · ${check.env}` : 'Valid',
         impact: 'No configuration problems detected.',
      }
   }

   return {
      id: 'config',
      title: 'Server configuration',
      severity,
      detail: check.detail ?? 'Configuration issues detected',
      impact:
         'Parts of the server are misconfigured and will fail intermittently until the environment is corrected.',
   }
}

const BUILDERS: Record<string, (check: HealthCheck) => Finding> = {
   storage: storageFinding,
   mongodb: mongodbFinding,
   binaries: binariesFinding,
   auth: authFinding,
   config: configFinding,
}

/** Turn a health payload into the findings the Doctor screen renders. */
export function buildFindings(payload: HealthPayload | undefined): Finding[] {
   if (!payload?.checks) return []

   const findings: Finding[] = []
   for (const [key, check] of Object.entries(payload.checks)) {
      const build = BUILDERS[key]
      if (build) {
         findings.push(build(check))
         continue
      }
      // A probe we have no copy for still gets shown — silence would hide a
      // failing subsystem behind a missing dictionary entry.
      const severity = severityFor(check.status)
      findings.push({
         id: key,
         title: key.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()),
         severity,
         detail: check.detail ?? String(check.status),
         impact: '',
      })
   }
   return findings
}

/** One-line description of the payload, for the summary banner. */
export function describeOverall(payload: HealthPayload | undefined): string {
   if (!payload) return 'Checking…'
   const findings = buildFindings(payload)
   const worst = worstSeverity(findings)
   const problems = findings.filter(
      f => f.severity === 'warn' || f.severity === 'bad'
   ).length

   if (worst === 'ok') return 'Everything is working'
   if (problems === 0) return 'Nothing to report for this setup'
   return problems === 1 ? '1 thing needs attention' : `${problems} things need attention`
}

export interface RuntimeFacts {
   uptime?: string
   p95?: number
   requests?: number
   errors?: number
   checkedAt?: string
   /** REST base this build is actually using. */
   apiBase: string
   /** How that base was decided — see lib/apiTarget.ts. */
   apiSource: ApiTargetSource
}

/**
 * Facts shown on the Doctor screen.
 *
 * `apiBase`/`apiSource` are derived from the build, not from the response, so
 * they are reported even when the backend is unreachable — which is precisely
 * when "what is this build even talking to?" is the only useful answer. A
 * misconfigured origin is invisible in a health payload; it *is* the bug.
 */
export function runtimeFacts(payload: HealthPayload | undefined): RuntimeFacts {
   const target = describeApiTarget()
   return {
      apiBase: target.apiBase,
      apiSource: target.source,
      ...(payload
         ? {
              uptime: humanUptime(payload.uptimeS) || undefined,
              p95: payload.latency?.window60s?.latencyMs?.p95,
              requests: payload.latency?.window60s?.requests,
              errors: payload.latency?.recentErrors?.length,
              checkedAt: payload.generatedAt,
           }
         : {}),
   }
}
