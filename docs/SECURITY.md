# Security Policy

## Supported versions

| Version | Support |
|---------|---------|
| 2.16.x  | Security fixes |
| 2.15.x  | Security fixes (best effort) |
| < 2.15  | None — upgrade |

## Reporting a vulnerability

Do **not** open a public GitHub issue for security vulnerabilities.

Private channels, in order of preference:

1. GitHub Security Advisories → "Report a vulnerability" on this repository (private by default)
2. Private message to LethaboK: <https://github.com/picklem0b>

Include: description, reproduction steps (PoC welcome), impact assessment, and a suggested fix if you have one. You will receive an acknowledgment within 7 days. Confirmed vulnerabilities get a fix and credit in the [changelog](CHANGELOG.md) (or anonymity if you prefer).

## Security model in brief

- **Authentication** — Clerk session JWTs, RS256-verified against Clerk's JWKS; fail-closed in production (no dev identity, no decode-without-verification). Full model: [Auth & Security](AUTH.md).
- **Authorization** — per-user isolation on every store, keyed by the Clerk `sub`; cross-user access yields 404, enforced by tests.
- **Public surface** — only health/meta, media byte routes, the share card, and the Svix-signed webhook; each documented and justified in [AUTH.md](AUTH.md#public-surface-deliberate).
- **SSRF** — all server-side fetches pass netguard (scheme/credentials/ports, media-host allowlist, public-IP DNS resolution); the artwork proxy has a separate strict allowlist. Known gap and roadmap: [AUTH.md](AUTH.md#ssrf-defense-netguard).
- **Webhooks** — 503 without a secret; Svix HMAC + freshness window + constant-time comparison.
- **Transport/headers** — CORS allowlist (no wildcard-with-credentials), security headers, HSTS on non-localhost.
- **Rate limiting** — per-IP sliding windows on search/downloads/auth/stream/lyrics with `Retry-After`.
- **Secrets** — git-ignored env files, production startup fails without required secrets, redacted logs.

## Verification for operators

After deploying, run the post-deploy checklist in [DEPLOYMENT.md](DEPLOYMENT.md#post-deploy-checklist) — it includes auth, webhook, and isolation spot-checks.

## Scope notes

- The audio library and per-user stores live on **your** server; compromise of the server compromises that data (self-hosted model — see [Privacy](PRIVACY.md)).
- Dependency audit: `pip audit` / `npm audit` are run when dependencies change; reports are triaged the same as reports here.
