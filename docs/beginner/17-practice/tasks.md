# Practice Tasks — Real Work on Real Code

*Stage 17. Tasks in ascending difficulty. Each states: the goal, where to look, the definition of done, and which gates must pass. Do them in branches (`git switch -c practice/<task>`), never on dev.*

## Absolute beginner

### T1 — Make the empty-state friendlier
**Where:** `web/src/pages/downloads/Downloads.tsx` (the `No local music found` block).
**Do:** reword the message, add one sentence pointing users at the Search tab. Keep the styling classes exactly.
**Done:** visually verified in `npm run dev`; no type errors.
**Learn:** how a JSX text change flows through the build; the four render states from [04 §9](../04-react/components-and-state.md).

### T2 — Add a keyboard shortcut to focus the library filter
**Where:** `Downloads.tsx`; you'll add a `useRef` on the input and a `useEffect` with a window `keydown` listener (hint: `/` is the convention).
**Done:** pressing `/` focuses the input; typing still works; listener is cleaned up on unmount.
**Learn:** refs, effect cleanup, event listeners ([04 §4](../04-react/components-and-state.md)).

### T3 — Write your first frontend test
**Where:** `web/src/__tests__/formatters.test.ts`.
**Do:** add cases for `formatDuration(0)`, `(59.9)`, `(3600)`. If any expectation fails, that's a *finding*: decide (with the suite owner's hat on) whether code or expectation is right.
**Done:** `npm test -- --run` green; each case commented with *why* that value.
**Learn:** assertions, edge cases, reading failures ([12](../12-testing/how-testing-works.md)).

### T4 — Glossary pass
**Do:** read `web/src/lib/constants.ts` top to bottom. For every export, write one sentence in your notes about what it's for. Anything you can't explain, trace it to one usage.
**Done:** you can name what `API_BASE`, `ENDPOINTS`, `STORAGE_KEYS`, `DOWNLOAD_DEFAULTS`, `APP_VERSION` each do.
**Learn:** the app's configuration surface.

## Beginner

### T5 — Add pluralization to the My Music header
The header prints `{localCount} tracks` even for 1. Add a small helper (`formatCount`-style) in `lib/formatters.ts` **with tests**, and use it for `track/tracks`.
**Done:** helper + tests merged in one commit: `feat(formatters): pluralized track counts`.
**Learn:** pure functions, testing-while-building ([01 §2](../01-programming-basics/variables-functions-data.md)).

### T6 — Validate a query param on an existing endpoint
`GET /api/tracks/trending?limit=…` clamps in the handler. Tighten it at the framework level instead: `limit: int = Query(20, ge=1, le=50)` and simplify the handler. Check `/docs` renders the constraint.
**Done:** out-of-range values → 422 with a clear message; existing tests still green; add one test for the 422.
**Learn:** FastAPI validation, the contract tests' role ([06 §3/§6](../06-backend/api-guide.md)).

### T7 — Improve an error message end-to-end
Pick one generic failure ("Download failed") and make it specific at the *right* layer: backend raises a precise detail, the api wrapper passes it through, the UI shows it. Grep `catch` blocks to find where messages get flattened.
**Done:** a repro path where the user now learns *what* failed; tests pin the new message.
**Learn:** the error path from service → router → client → UI ([11 §4](../11-debugging/practical-debugging.md)).

### T8 — Trace and document a request
Choose an endpoint not yet covered in your notes; trace it from UI tap to JSON response; write the diagram in the style of [05 §6](../05-codebase/architecture.md). If the real code contradicts the existing docs, that's a finding — file it.
**Learn:** vertical reading, the layer rules.

## Intermediate

### T9 — Add a "remove from history" affordance
Backend: `DELETE /api/tracks/history/{track_id}` (authed — history is account data; decide + test the guest story). Frontend: long-press menu item on a Recently Played row, calls a new api wrapper, invalidates the right `queryKey`.
**Done:** tests for the endpoint (auth matrix + isolation), the menu item works, `docs/API.md` updated, all gates green.
**Learn:** the full vertical slice recipe ([14-how-to](../14-how-to/recipes.md)).

### T10 — Fix a deliberately degraded cache
Temporarily comment out one `invalidate_*` call after download completion, run the app, and observe the stale-library bug yourself. Then write the test that would have caught it (a download-then-list test in `api/tests/`), restore the call, and see your test pass.
**Done:** new test in the suite; commit message explains the regression it pins.
**Learn:** the invalidation chain ([15 §13](../15-code-patterns/patterns.md)), why integration tests exist.

### T11 — Schema-drift audit of one page
Pick one page. Grep every direct property access on API data (`track.`, `job.`, `pl.`) and list which ones would crash on missing fields. Add the missing `?.`/`??` guards for anything crossing storage boundaries, following the `DownloadRow` pattern.
**Done:** the page renders with a hand-mangled response (mock it in the Network tab / devtools); PR lists each guard and why.
**Learn:** defensive rendering, the drift-guard pattern.

### T12 — Add a rate-limit test
Write a test that exceeds `RATE_LIMIT_LYRICS` (patch settings to 2/min in the test) and asserts the third call gets 429. Learn the limiter's keying from its module first.
**Done:** test merged; the limiter's behavior now pinned like everything else.
**Learn:** abuse surfaces, per-IP keyed state in tests ([06 §6](../06-backend/api-guide.md)).

## When a task reveals a real bug

You're allowed — encouraged — to turn any practice task into a real PR. The bar is the repo's normal one: tests travel with the fix, docs updated if behavior changed, conventional commit. Several of this repo's past fixes started exactly this way.
