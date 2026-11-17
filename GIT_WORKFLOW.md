# Git Workflow

The numbering is Vstore's, unchanged: conventional commits with a scope, and annotated `v3.[phase].[step]` tags, one commit per tag. If a rule here is wrong, change this file in the same commit that fixes the habit.

## Branches

| Branch | Holds | Deploys to | Written by |
| --- | --- | --- | --- |
| `development` | every V3 commit | nothing | direct commits |
| `dev` | the release candidate | staging | a pull request from `development` |
| `main` | production | production | a pull request from `dev`, merged by the owner |

`main` and `dev` are never committed to directly. At the end of a phase, once its exit criteria pass, a pull request is opened from `development` into `dev`; the owner reviews and merges it. `dev` reaches `main` the same way.

```
development  ──PR v3.9——►  dev  ──PR v3.10——►  main
```

Nothing is merged to `main` by an agent. Nothing is tagged on a branch that is not the one the work is on.

## Commits

Conventional Commits, imperative mood, with a scope:

```
feat(web): resume the queue after a reload
fix(api): return 404 when a playlist id does not exist
chore(db): index favourites by user and created date
docs(architecture): document the repository layout
```

Scopes: `web`, `api`, `db`, `shared`, `ui`, `docs`, `ci`, `repo`.

The subject states the change. The body explains why it was needed and what was verified. Wrap at 72 characters. Keep one purpose per commit.

No `Co-Authored-By` trailers. No `Generated with` lines. No attribution footers of any kind.

| Type | Use for |
| --- | --- |
| `feat` | behaviour a user can see |
| `fix` | a defect, including one found while building the next thing |
| `refactor` | same behaviour, better shape |
| `perf` | a measured improvement |
| `docs` | documentation only |
| `test` | tests and fixtures |
| `build` | dependencies, tooling, bundling |
| `ci` | workflows and gates |
| `chore` | workspace, config, housekeeping |
| `revert` | undoes a previous commit, quoting its hash |

## Tags

Tags are annotated. Created only when the stated state typechecks, runs, and its behaviour has been verified.

```bash
git tag -a v3.0.1 -m "v3.0.1: workspace and root config" -m "pnpm workspace
covering web, api and packages/shared. tsconfig.base.json shared by every
package. ESLint and Prettier configured at the root. Verified: pnpm install
succeeds, pnpm typecheck and pnpm lint pass with zero errors."
```

Format: `v3.[phase].[step]`. Phase 0 is the environment, phase 1 the data spine, and so on; the step counts verified commits inside a phase.

1. One commit per tag. The tag points at the commit that landed the change.
2. The annotation is readable without opening the commit: what landed, and what was verified.
3. Both are written as if a future reader will navigate the history to understand when a feature appeared or a bug was introduced.
4. The next number is the highest existing plus one. A step that was never cut is never inserted between two that were.
5. Never move or delete a published tag. A mistake gets a new step, never a rewritten one.
6. `git push origin development --follow-tags`: a tag that exists on one machine does not exist.

## Phase pull requests

- Title: `v3.P — <theme>`, for example `v3.0 — Environment`.
- Body: the exit criteria from `docs/ROADMAP.md`, and the tags it contains.
- The owner merges. An agent opens it and stops there.

## Gates

A change is ready to tag when:

- `pnpm typecheck` passes with zero errors
- `pnpm lint` passes with zero errors
- `pnpm --filter web build` succeeds
- `pnpm --filter api exec wrangler deploy --dry-run` succeeds when the worker, its bindings or its dependencies changed
- The stated behaviour has been manually or automatically verified
- `docs/ROADMAP.md` reflects the tag that was cut

A red gate is fixed, not muted. No `eslint-disable`, no `@ts-expect-error`, no skipped assertion to get a green run.

## Never

- Commit to `main` or `dev` directly.
- Merge a phase pull request on the owner's behalf.
- Move, amend or delete a published tag.
- Commit a `.env`, a `.dev.vars`, a token, a signed URL or a database dump.
- Add a hyphen to a file or folder name.
- Add attribution to a commit, a tag, a doc or a comment.
