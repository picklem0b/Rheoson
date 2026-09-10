# Contributing to Rheoson

Rheoson is a personal project with professional standards. Contributions are welcome — the bar is production-grade: no placeholders, no half-finished work, no untested changes.

## Ground rules

1. **One PR, one concern.** Reviewable scope beats ambitious scope.
2. **Tests travel with changes.** New endpoints get auth probes + isolation/validation tests; bug fixes get a regression test that fails without the fix.
3. **Quality gates are binary.** `pytest`, `pyflakes`, `tsc`, `eslint` (zero warnings), and the production build must all pass — CI enforces this per PR.
4. **Docs-in-PR rule.** A PR that changes endpoints, behavior, configuration, or deployment must update the document that owns that topic (see the [doc map](README.md)). Reviewers treat a missing doc update like a missing test.
5. **License:** Apache-2.0 — contributions land under the same license.

## Setup

```bash
git clone https://github.com/picklem0b/Rheoson && cd Rheoson
# Backend + frontend setup, quality gates, and test conventions:
# see the Development Guide
```

Full local setup, test suite conventions, and release workflow live in [DEVELOPMENT.md](DEVELOPMENT.md).

## Workflow

```
main      stable, production-ready only (tagged releases)
dev       integration branch — all work merges here first
feature/* branched off dev
fix/*     branched off dev (or main for hotfixes)
```

1. `git checkout dev && git pull && git checkout -b fix/your-fix`
2. Make the change + tests + doc updates.
3. Verify the quality gates locally (see [DEVELOPMENT.md](DEVELOPMENT.md#quality-gates)).
4. Commit with [Conventional Commits](../GIT_WORKFLOW.md#committing): `fix(stream): prevent duplicate fill sessions`
5. Push and open the PR **against `dev`**. CI runs lint/typecheck/tests and the docs check.
6. After merge, the maintainer cuts releases from `dev` → `main` with annotated tags (flow and tagging rules: [GIT_WORKFLOW.md](../GIT_WORKFLOW.md#tagging-releases)).

## What gets a PR merged

- Fixes a real, described problem (with a repro when applicable)
- Stays in scope; the diff is reviewable
- Includes tests that pin the behavior
- Updates the docs it made stale
- Passes all gates

## What gets a PR closed

- Untested behavior changes
- New architectural direction proposed without an issue first
- Feature creep bundled into a bug fix
- Silence after review feedback (28 days auto-closes stale threads — just rebase and ping)

## Reporting bugs

Open a GitHub issue with: what you did, what you expected, what happened, versions (from `/api/health`), and logs with request IDs. Security issues are **not** for public issues — see [SECURITY.md](SECURITY.md).

## Documentation

Docs follow a strategy so they stay trustworthy:

- **Ownership:** each topic has one owning document (endpoints → `API.md`, ops → `OPERATIONS.md`, …). The README is the canonical overview; deep dives own their subsystem.
- **Status labels:** features are **Implemented / Partial / Experimental / Planned / Deprecated** — keep the [status matrix](STATUS.md) honest.
- **Terminology:** use [glossary](GLOSSARY.md) terms; add new concepts there.
- **Stamps:** refresh the *last verified* line on any doc you materially edit; release tagging refreshes them wholesale (see [DEVELOPMENT.md](DEVELOPMENT.md#documentation-maintenance-at-release-time)).
- CI validates internal links and endpoint references on every PR.

---

*Last verified against `main`: 2026-09-10 (v2.16.5).*
