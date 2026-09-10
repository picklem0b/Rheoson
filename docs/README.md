# Rheoson Documentation

**Self-hosted music. No subscription. No ads. No compromise.**

Welcome to the Rheoson documentation. Start wherever matches your goal — every page cross-links so you can progress through the whole system from here.

> **Audience:** developers, contributors, self-hosters, and maintainers.
> **Depth:** balanced overall; the deep dives go code-level where the detail earns its place.
> **Authority:** the [README](../README.md) is the canonical overview; these documents are the long-form reference.

---

## Your first stop

| If you want to… | Read |
|-----------------|------|
| Understand what Rheoson is | [README](../README.md) → [Architecture](ARCHITECTURE.md) |
| Deploy your own instance | [Deployment](DEPLOYMENT.md) → [Operations](OPERATIONS.md) |
| Contribute code | [Contributing](CONTRIBUTING.md) → [Development](DEVELOPMENT.md) |
| Build against the API | [API Reference](API.md) (+ live Swagger at `/api/docs`) |
| Understand how it works inside | [Deep dives](#deep-dives) below |
| Stay safe / report a vulnerability | [Security](SECURITY.md) |

## Recommended reading order

1. [README](../README.md) — what it is, quick start, feature tour
2. [Architecture](ARCHITECTURE.md) — how the pieces fit
3. [API Reference](API.md) — every endpoint, auth, errors, rate limits
4. [Data & Database](DATA.md) — where state lives and why
5. [Deployment](DEPLOYMENT.md) — Render / Docker / Termux / APK
6. [Operations](OPERATIONS.md) — health, backups, incidents, upgrades
7. Deep dives — streaming, downloads, auth, frontend, mobile

---

## Deep dives

| Document | Covers |
|----------|--------|
| [Streaming Pipeline](STREAMING.md) | yt-dlp fill sessions, buffer promotion, byte-range serving, failure caching |
| [Download Pipeline](DOWNLOADS.md) | Staging, ffmpeg conversion, tagging, sanitization, cancel/retry semantics |
| [Auth & Security](AUTH.md) | Clerk verification, webhook signing, user isolation, SSRF guard, threat model |
| [Data & Database](DATA.md) | MongoDB collections/indexes, file-backed stores, track identity bridge |
| [Frontend Internals](FRONTEND.md) | State stores, single-Howl player, offline queue, PWA service worker |
| [Mobile / Android](MOBILE.md) | Capacitor integration, APK builds, env separation, on-device behavior |

---

## Reference

| Document | Contents |
|----------|----------|
| [API Reference](API.md) | Endpoints, schemas, errors, rate limits, WebSocket events |
| [Glossary](GLOSSARY.md) | Canonical terms — every doc uses these consistently |
| [Feature Status](STATUS.md) | Implemented / Partial / Planned / Deprecated / Experimental matrix |
| [Changelog](CHANGELOG.md) | Release history |
| [Roadmap & status matrix](STATUS.md) | What is implemented, partial, planned, deprecated |

## Operations & policy

| Document | Contents |
|----------|----------|
| [Deployment](DEPLOYMENT.md) | Render, Docker, Termux, APK builds, post-deploy checklist |
| [Operations Runbook](OPERATIONS.md) | Health probes, backups, log shipping, recovery, secret rotation |
| [Security Policy](SECURITY.md) | Supported versions, reporting, hardening notes |
| [Privacy](PRIVACY.md) | What data lives where |
| [Terms](TERMS.md) | Terms of service |
| [License](../LICENSE) | Apache-2.0 |

## Contributing

| Document | Contents |
|----------|----------|
| [Contributing](CONTRIBUTING.md) | Ground rules, PR bar, docs-in-PR rule |
| [Development](DEVELOPMENT.md) | Local setup, testing, linting, release/tag workflow |
| [Git Workflow](../GIT_WORKFLOW.md) | Branches, Conventional Commits, tagging |

---

## Conventions used across these docs

- **Diagrams:** ASCII in overview docs (renders anywhere), [Mermaid](https://mermaid.js.org) in deep dives (renders on GitHub).
- **Terminology:** terms link to the [Glossary](GLOSSARY.md) on first use; docs never invent synonyms for the same thing.
- **Status labels:** features carry one of **Implemented**, **Partial**, **Planned**, **Deprecated**, **Experimental** — see the [status matrix](STATUS.md).
- **Code values:** where behavior is tunable, docs describe the mechanism and link the setting; exact defaults live in `api/app/core/config.py` and are marked as such.
- **Verification:** every doc ends with a *last verified* stamp refreshed during release tagging (see [Contributing → Docs](CONTRIBUTING.md#documentation)).

## Maintenance rules

1. **Docs-in-PR rule:** a PR that changes endpoints, behavior, or configuration must update the document that owns that topic. Reviewers treat missing doc updates as missing tests.
2. **Link integrity:** CI checks internal doc links and endpoint references (see `.github/workflows/docs-check.yml`).
3. **Last-verified stamps:** refreshed as part of tagging a release — see [DEVELOPMENT.md](DEVELOPMENT.md).

---

*Last verified against `main`: 2026-09-10 (v2.16.5, commit `8e2d6a1`).*
