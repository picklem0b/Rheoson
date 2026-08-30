# Rheoson — Git Workflow

## Branch strategy

```
main          stable, production-ready code only
dev           integration branch — all features merge here first
api           backend (FastAPI) work
web           frontend (React) work
feature/*     individual features, branched off dev
fix/*         bug fixes, branched off dev (or main for hotfixes)
```

## One-time setup

Create the branches if they don't exist yet:

```bash
git checkout -b dev   && git push -u origin dev
git checkout -b api   && git push -u origin api
git checkout -b web   && git push -u origin web
git checkout main
```

## Daily workflow

### Starting a new feature

```bash
# Always branch off dev, not main
git checkout dev
git pull origin dev
git checkout -b feature/your-feature-name
```

### Committing

Commit messages follow Conventional Commits:
  `type(scope): short description`

Types:
  `feat`     — new feature
  `fix`      — bug fix
  `refactor` — code change that isn't a feature or fix
  `chore`    — build, config, dependencies
  `docs`     — documentation only
  `style`    — formatting, no logic change
  `perf`     — performance improvement

Examples:
```bash
git add -A
git commit -m "feat(home): add see-all pages for trending and recently played"
git commit -m "fix(playlists): purge swagger placeholder entries on startup"
git commit -m "chore(docker): fix api Dockerfile entry point to socket_app"
git commit -m "fix(nav): timer now resets on every nav tap instead of hiding mid-interaction"
```

### Pushing a feature branch

```bash
git push -u origin feature/your-feature-name
```

Then open a PR on GitHub: `feature/your-feature-name` → `dev`

### Merging into dev

```bash
git checkout dev
git merge --no-ff feature/your-feature-name
git push origin dev
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

### Merging dev → main (release)

```bash
git checkout main
git merge --no-ff dev
git push origin main
```

## Tagging releases

Rheoson uses semantic versioning: `vMAJOR.MINOR.PATCH[-rc]`
  - `rc` = release candidate (still being tested)
  - no suffix = stable release

### Current tag: v1.3.0-rc

**Promote rc to stable:**
```bash
git checkout main
git tag -a v1.3.0 -m "Release v1.3.0 — home sections, playlist fixes, nginx/docker overhaul"
git push origin v1.3.0
```

**Tag a new release candidate:**
```bash
git checkout main
git tag -a v1.4.0-rc -m "Release candidate v1.4.0-rc"
git push origin v1.4.0-rc
```

**Delete and recreate a tag (if you need to move it):**
```bash
git tag -d v1.3.0-rc
git push origin --delete v1.3.0-rc
git tag -a v1.3.0-rc -m "Release candidate v1.3.0-rc"
git push origin v1.3.0-rc
```

**List all tags:**
```bash
git tag --sort=-creatordate
```

**See what's in a tag:**
```bash
git show v1.3.0-rc
```

## Keeping api and web branches in sync with dev

```bash
# After merging a feature into dev, update api:
git checkout api
git merge dev
git push origin api

# Same for web:
git checkout web
git merge dev
git push origin web
```

## Hotfix (bug on main that can't wait for a full release)

```bash
git checkout main
git checkout -b fix/critical-bug-name
# ... fix the bug ...
git add -A
git commit -m "fix(scope): description of the hotfix"
git checkout main
git merge --no-ff fix/critical-bug-name
git push origin main
git branch -d fix/critical-bug-name
# Tag the hotfix
git tag -a v1.3.1 -m "Hotfix v1.3.1 — description"
git push origin v1.3.1
# Back-merge into dev so it has the fix too
git checkout dev
git merge main
git push origin dev
```