# How To — Recipes for Real Changes

*Stage 14. Each recipe is the actual loop: where to touch, what gates to run, what the PR includes. All paths are real; conventions come from CONTRIBUTING.md.*

## Universal checklist (before any commit)

```bash
cd api && uv run pytest -q              # backend green
cd ../web && npx tsc --noEmit           # types green
npx eslint src                          # lint clean (zero warnings)
npm test -- --run                       # unit tests green
npm run build                           # production build passes
```

Commit: `type(scope): summary` + body explaining *why*. Docs: if you changed an endpoint/behavior/config, update the doc that owns it (see `docs/README.md` map). PR → `dev`.

---

### How do I run the project?

```bash
# backend
cd api && uv run uvicorn app.main:socket_app --reload
# frontend (second terminal)
cd web && npm run dev            # open http://localhost:3000
```

### How do I add a dependency?

1. Ask first: does the stack already have it? (`grep` the imports.)
2. Frontend: `npm i <pkg>` (updates both json+lock — commit both). Backend: add to `api/pyproject.toml` dependencies, then `uv lock`.
3. Use it in exactly one wrapper module if it's a client/SDK (the `api/` layer pattern), wire it in the place that owns the concern.
4. PR description: what it does, why existing deps can't, link to its docs.

### How do I remove a dependency?

`grep -rn "<pkg>" web/src api/app` → remove usages → `npm uninstall` / drop from pyproject + `uv lock` → build. If anything still imports it, the gates will catch it.

### How do I create a component?

1. Right folder: shared UI → `web/src/components/ui/`; feature-specific → next to its page (`pages/downloads/components/`).
2. Function component with typed props interface; import types with `import type`.
3. Behavior goes in hooks/stores — not in the component body (see [04 §5/§7](../04-react/components-and-state.md)).
4. Cover all four render states if it shows data: loading / empty / filtered-empty / content.
5. Style with Tailwind tokens (`text-[var(--text-primary)]`) so themes keep working; merge classes with `cn()`.

### How do I create a page?

1. `web/src/pages/<name>/<Name>.tsx` — export default the component.
2. Register the route in `web/src/router.tsx` (inside `RootLayout` unless fullscreen like `/now-playing`).
3. Add navigation where it belongs (BottomNav/Sidebar/Search) — or deep-link only.
4. Data via the existing api modules; new endpoint → new function in the matching `web/src/api/*.api.ts`.

### How do I add an API endpoint?

1. Router: find the area's file in `api/app/routers/` (or create one and mount it in `main.py`).
2. Choose auth deliberately: `get_optional_user` (guest-first reads/actions) vs `get_current_user` (account data, admin). This is a *policy* decision — `tests/test_guest_policy.py` will fail until you classify correctly, by design.
3. Business logic in the matching service; response shape as a Pydantic schema (or `response_model=`) so `/docs` and the generated types stay honest.
4. Add tests: guest vs authed, validation, isolation if user-scoped.
5. Regenerate the contract: `uv run python scripts/export_openapi.py`, then in `web/`: `npx openapi-typescript src/types/openapi.json -o src/types/api-generated.ts`.
6. Update `docs/API.md` (the docs-in-PR rule).

### How do I call an API from React?

```ts
// 1. one typed wrapper in web/src/api/<area>.api.ts
export async function getTrending(limit = 20) {
  return api.get<Track[]>(`/tracks/trending?limit=${limit}`)
}
// 2. consume with useQuery for reads
const { data, isLoading } = useQuery({
  queryKey: ['trending', limit],
  queryFn: () => getTrending(limit),
  staleTime: 60_000,
})
```

Reads → useQuery. Mutations → the store/hook pattern (see `useDownloads`). Never `fetch` in a component.

### How do I modify an existing feature?

Find the vertical slice: page → hook → api module (frontend), or router → service (backend). Change one layer at a time. If behavior changes, update its tests and the doc that owns it. If a *stored* shape changes, add drift guards on read (the `?? default` pattern) — old clients and old caches exist.

### How do I add a database field?

1. Make it optional on read everywhere (`doc.get("field", default)`) — schemaless DB, old docs exist.
2. Update the Pydantic schema + regenerate frontend types.
3. Preferences are whitelisted in the prefs service — add the key there if it's a setting.
4. Backfill only if a *query* depends on the field; otherwise defaults suffice.

### How do I add a test?

Backend: `api/tests/test_<area>.py`, fixtures from conftest (`client`, `client_anon`, `client_as_other_user`), async + parametrize for matrices, name = the rule. Frontend: `web/src/__tests__/<name>.test.ts` next to pure logic; mock only boundaries. A bug fix's test must fail without the fix — verify by stashing it once.

### How do I fix a TypeScript error?

Read the *first* error and the type it references (§5 of [11-debugging](../11-debugging/practical-debugging.md)). Prefer narrowing/optional-chaining over `!`. If the fix is "the type is wrong", fix the type at its source in `types/` — never cast your way out locally.

### How do I inspect what changed before committing?

```bash
git status --short
git diff                 # unstaged
git diff --staged        # what a commit would contain
git log --oneline -5     # message style to match
```

### How do I bump the version / cut a release?

All five files together (`api/pyproject.toml`, `web/package.json` + lock, `web/src/lib/constants.ts`, `api/app/main.py`) → changelog entry in `docs/CHANGELOG.md` → gates → merge dev→main `--no-ff` → annotated tag `v2.MILESTONE.PHASE` with subject + bullets → `git push origin main dev --follow-tags` (full story: `GIT_WORKFLOW.md`).
