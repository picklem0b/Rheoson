# Contributing to Shulker

Shulker is a personal project. Contributions are welcome but the bar is high — production-grade only, no placeholders, no half-finished work.

---

## Setup

```bash
git clone https://github.com/picklem0b/shulker
cd shulker
```

**Backend**

```bash
cd api
pip install -e ".[dev]" --break-system-packages
cp .env.example .env
uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

**Frontend**

```bash
cd web
npm install
npm run dev
```

Requires: Python 3.13+, Node.js 18+, ffmpeg, yt-dlp.

---

## Branching

- `main` — always stable, always deployable
- `dev` — active development, all PRs target this branch
- Feature branches: `feat/<short-description>`
- Fix branches: `fix/<short-description>`

Never commit directly to `main`. PRs from `dev` to `main` happen at version bumps only.

---

## Commits

Single-line only. No multi-line bodies, no bullet lists inside the message.

```
(feat): add socket reconnect on network drop
(fix): resolve CORS header on preflight
(chore): update lockfile
(refactor): extract token validation into middleware
(docs): add env variable reference to readme
(style): align button padding across card variants
```

Rules: lowercase after the colon, no trailing period, imperative mood — "add" not "added".

---

## Tags

Every meaningful change gets an annotated tag. Never lightweight.

```bash
git tag v1.x.y -m "Short description of what changed"
git push origin dev --follow-tags
```

Never push without `--follow-tags` when a tag was created that session. Tags follow `v(major).(minor).(patch)`.

---

## Pull requests

- One feature or fix per PR — no bundling unrelated changes
- Target `dev`, not `main`
- Update `docs/CHANGELOG.md` with your version entry
- Test locally before opening the PR — streams, downloads, and WebSocket all need to work

---

## Code rules

- No `any` in TypeScript unless genuinely unavoidable and commented
- No `console.log` left in production paths
- No decorative comment banners (`// ---- section ----` style)
- No placeholder logic, no `// TODO` stubs in delivered code
- Errors handled explicitly — no silent `catch {}` blocks
- Python: follow the existing `structlog` + `async/await` + executor pattern
- File naming: `*.service.ts`, `*.store.ts`, `*.hook.ts`, `*.router.ts` etc — see existing files

---

## What not to contribute

- Features that require paid third-party services
- Anything that facilitates large-scale copyright infringement
- Windows-specific code — Termux/Linux/Mac only
- New dependencies without prior discussion
- Breaking changes to the stream or download pipeline without a fix for all known affected files
