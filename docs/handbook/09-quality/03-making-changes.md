# Chapter 17 — Making Changes

*Part IV · Engineering Practice*

---

Every recipe below follows the same skeleton: branch off `dev` → make the change → run the gates (16.5) → commit per 14.3 → PR into `dev`. This chapter covers the last-mile specifics — where files go, what must be updated together, what the gates will demand. The recipes are ordered roughly by how often they come up.

## 17.1 Set up a change

```bash
git switch dev && git pull
git switch -c feat/<topic>          # or fix/, docs/, chore/
```

While working: `git status` and `git diff --stat` between edits (13.2's loop), gates before every commit.

## 17.2 Add or remove a dependency

**Add** — justify against Chapter 11 first, then:

```bash
cd web && npm install <pkg>          # frontend — updates package.json + lockfile
cd api && uv add <pkg>               # backend — updates pyproject.toml + uv.lock
```

Wire it behind an existing boundary (a UI primitive under `components/ui/`, an API wrapper in its own module) and record architectural/functional additions in Chapter 11's chapter itself. **Remove** — delete every import (`grep -rn "<pkg>" web/src api/` proves it), then remove the declaration and re-lock. A dependency with no imports is dead weight and supply-chain surface.

## 17.3 Create a component

1. Find the nearest existing component of the same kind and read it (8.7's slice rule).
2. Create the file where its kind lives: shared UI under `components/ui/` or `components/player/`, page-specific under the page's folder.
3. The shape is 7.1–7.2's: typed props interface, destructured in the signature, default export, `cn()` for conditional classes.
4. Render it in one parent; add a test only if it contains logic beyond markup.

The gate demands: props typed (no `any`), every non-happy state handled if the component renders data (7.12).

## 17.4 Create a page

1. Add the component under `pages/<name>/`.
2. Register the route in `web/src/router.tsx` — inside the `RootLayout` shell unless fullscreen (7.11's NowPlaying exception).
3. Wire navigation from wherever the user reaches it.
4. Implement all four states — loading, error, empty, happy (7.12) — using the Downloads page as the reference.
5. If the page fetches: an API module function first (17.5), a hook or TanStack Query second, never `fetch` in the component.

## 17.5 Add an API endpoint (backend) and call it (frontend)

Backend:

1. The service function first — business logic in `services/`, fully typed, raising `RheosonException` subclasses on failure (9.3).
2. The route in the matching router — decorator with path, method, `response_model`; body as a Pydantic schema; `get_optional_user` or `get_current_user` per 9.9's matrix.
3. **Route order**: a literal path registers before any `/{param}` that could shadow it.
4. Add the endpoint to the inventory test's access-class declaration — the suite will fail without it, by design.
5. Regenerate the OpenAPI snapshot (`uv run python scripts/export_openapi.py`).

Frontend:

6. The typed wrapper in the matching `api/*.ts` module, returning the generated type — the regenerated `types/api-generated.ts` (step 5) makes the response checkable (5.6).
7. Consume via TanStack Query or a hook; component code stays fetch-free.

The gates then enforce the whole chain: backend tests for the new behavior, `tsc` for the contract, the build for the bundle.

## 17.6 Modify an existing feature

Read the vertical slice first (8.7): page → hook → api module → router → service. Change the deepest layer first and let types propagate upward — the compiler converts every required call-site update into a checklist. The two traps with history: schema fields that look unused may be part of the *persisted* contract (10.4's sidecars), and any change touching the cache-invalidation chain must re-run the invalidation tests specifically.

## 17.7 Add a database field

Per 10.3's rule: **new fields need defaults**, or existing documents fail validation on read.

1. Schema (Pydantic, `= default`) and/or model updated.
2. The write path populates it; the read path tolerates its absence for old data.
3. If it needs an index, it goes in the collection setup with the others.
4. Regenerate OpenAPI + frontend types (17.5's steps 5–6).

The same recipe for the JSON sidecars, minus the database: new fields default on read, full-file replace on write (10.4).

## 17.8 Add a test

16.6's procedure applies verbatim. Choose the file by subject (policy → `test_guest_policy.py`, utilities → `web/src/__tests__/`), name it as a sentence, and run it against unmodified code first.

## 17.9 Ship a release

The full sequence, from `GIT_WORKFLOW.md` — the only part of this chapter that must not be improvised:

1. Gates green on `dev` (16.5), all planned work committed.
2. **Bump the five version files together**: `api/pyproject.toml`, `web/package.json` (+ lockfile via `npm install --package-lock-only`), `web/src/lib/constants.ts`, `api/app/main.py`.
3. Update `docs/CHANGELOG.md` — the phase's entry.
4. Merge `dev` → `main`. **Resolve generated files by regenerating, not by hand** (14.6's rule).
5. Verify on `main`: version surfaces, changelog, then gates once more.
6. Tag the merge commit: `git tag -a v2.<milestone>.<phase> -m "v2.x.y — theme" -m "- bullet"`.
7. `git push origin main dev --follow-tags`; back-merge `main` → `dev` and push.
8. CI builds the APK from `main`; the cloud deploy follows its channel (18.3).

The version rule behind step 2: `v2.MILESTONE.PHASE` — milestone moves rarely, phase moves per completed batch; a tag without its five-file bump ships an APK that lies about its identity (12.4's update invariant depends on it).

## 17.10 Fix a TypeScript error — properly

5.8 covered the two common messages; the procedure for both: read both sides of the disagreement, locate where the questionable value *entered* (the boundary, per 5.6), fix there — guards, defaults, validation — and treat a cast (`as`) at the use site as a debt note, not a fix. If the fix would touch more than the boundary, that is a design conversation, not an error to silence.

## Exercises

1. Follow 17.5 end to end with a harmless scratch endpoint (`GET /api/meta/build-info` returning the version), including the inventory entry and generated types. Which gate caught what?
2. The release sequence omits step 7. What drifts, and when would someone notice?
3. Take 17.3's recipe and add a `SkeletonTrackRow` component, then use it in one page's loading state (7.12). List every file touched.
4. A "quick fix" edits `_file_id()`'s output length to save bytes. Write the review comment, citing the two chapters that make this the most expensive four-character change in the codebase.
5. Compare 17.9 step 4 against 14.6's conflict you built earlier: which files in a real release merge are "generated," and how do you know without asking?
