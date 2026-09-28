# Rheoson — Git Workflow

## Branch strategy

```
main                stable, production-ready code only (the shipping FastAPI/Vite app)
dev                 integration branch — all features merge here first
experiment/nextjs   the architectural rebuild (this branch): apps/* + packages/*
feature/*           individual features, branched off dev (or the experiment)
fix/*               bug fixes, branched off dev (or main for hotfixes)
```

> **Note:** on `experiment/nextjs` the legacy `web/` and `api/` trees no longer
> exist — they live on in `main`/`dev` history. Workflows here are
> path-scoped (`next-ci.yml` guards `apps/**`, `packages/**`, `infra/**`).

## Committing

Commit messages follow Conventional Commits:

```
type(scope): short description
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `build`, `ci`,
`chore`, `security`. Scope is the area (`library`, `ui`, `spotify`,
`downloads`, `server`, `client`, `engine`, `relay`, `shared`, …).

Keep commits to one logical change. Never reference AI tooling in commits,
tags, or code comments.

## Tags — every milestone gets one

Tags are the rollback story: any point in history is restorable, and the
tag message must make that point understandable without reading the diff.

Annotated tags use this structure:

```
next-vMAJOR.MINOR.PATCH: Title

Type: feature | fix | refactor | security | milestone
Scope: the slice that changed
Impact: additive | breaking | internal
Status: verified (test counts) | gates green | experimental

Summary
  Two or three sentences: what changed and why it matters.

Changes
  - new: path (what it is)
  - changed: path (what moved)

Breaking Changes   (only when Impact is breaking)
Fixes              (when this closes known bugs)
Security           (when relevant)
Performance        (when relevant)
Validation
  - exact gates run and their results
Migration          (when behaviour moves or is renamed)
Notes              (anything an auditor would otherwise have to ask)
```

Reserve minor/patch bumps for meaningful milestones rather than ordinary
commits — ordinary commits carry the story in their messages.

## Verification before every commit

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
cd apps/services/py && uv run python -m pytest -q && uv run pyflakes app tests
cd apps/services/go && go vet ./... && go test ./... && gofmt -l .
```

## Pushing

Nothing pushes automatically. `git push --follow-tags` is a deliberate,
manual act.
