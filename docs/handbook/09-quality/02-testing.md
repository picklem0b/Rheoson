# Chapter 16 — Testing

*Part IV · Engineering Practice*

---

Tests are executable specifications: they state what the code *should* do and verify it automatically, so confidence scales with the codebase instead of decaying with it. This chapter covers what tests are, how both suites in this repository work, and how to add to them.

## 16.1 The vocabulary

A **unit test** exercises one function or module in isolation; an **integration test** exercises several together (a route calling a service calling a fake database); an **end-to-end test** exercises the whole system (a request against a running server). The cost/reliability trade runs the same direction: unit tests are cheap and precise, E2E is expensive and true. This project's investment sits in the first two tiers — the backend suite pins services and the auth policy against a fake database, the frontend suite pins utilities and contracts — with E2E covered by scripted smoke checks against a running stack rather than a browser-automation framework.

**Assertions** are the executable "should": `assert total == 3`, `expect(rows).toHaveLength(3)`. A test fails when an assertion is false, when an error escapes, or when nothing asserts at all — the quiet failure mode of a test that exercises code but verifies nothing.

**Mocks and fakes** replace the outside world. A *mock* records how it was called ("did the code emit the done event?"); a *fake* is a working stand-in ("a dictionary pretending to be the database"). The backend suite is built on the fake kind — Chapter 16.3 shows it — because fake behavior composes across many tests while per-test mock setups drift.

**Coverage** measures which lines tests execute. Useful as a smoke detector for untested areas, misleading as a target — the codebase's position is that the *policy-critical* paths (auth matrix, cache invalidation, route order) must be pinned, while a percentage across everything tells you nothing about whether those paths are.

## 16.2 What a good test looks like

Three properties, all visible in the suite's strongest file (`api/tests/test_guest_policy.py`, Chapter 9.9's matrix):

```python
async def test_search_is_available_to_guests(client_anon):
    res = await client_anon.get("/api/search?q=sun+ra")
    assert res.status_code == 200          # the promise, exactly
```

**One behavior per test** — the name states it (`test_search_is_available_to_guests`), the body proves it, a failure reads as a sentence. **Independent** — any test passes or fails alone, regardless of order; the suite's one bout with shared cache state (fixed in `conftest.py`) is the cautionary tale. **Fast** — the whole backend suite runs in seconds against fakes; anything slower stops being run.

The naming convention in both suites encodes the sentence: `test_<subject>_<behavior>_<condition>`.

## 16.3 The backend suite (`api/tests/`)

**The fixture layer** (`conftest.py`) is the part to understand first. It provides an async `client` (HTTPX against the FastAPI app), a `client_anon` (the same, auth stripped), a fake database (a dict-shaped object standing in for Motor collections), and a token registry that lets a test *play* any identity. With those, an integration test reads like a unit test:

```python
async def test_liked_requires_identity(client_anon):
    res = await client_anon.post("/api/tracks/dQw4w9WgXcQ/like")
    assert res.status_code == 401
```

No MongoDB, no Clerk, no network — the app's *policies* are tested, its providers mocked. The fixture file also pins environment isolation (scratch `MUSIC_DIR`, scratch cache dirs) so tests cannot touch real data; this is the "test independence" property made physical.

**What the suite pins**, file by file: the guest/strict matrix endpoint by endpoint; the endpoint inventory (every route's access class is declared — a new endpoint without one fails the inventory test); route order (static before parameterized); the cache-invalidation chain; job persistence and cleanup; range-request semantics; and the pure services (`metadata`, `lyrics` parsing). The structure mirrors Chapter 9's layering deliberately: services are testable without HTTP because routers are thin.

## 16.4 The frontend suite (`web/src/__tests__/`)

Vitest runs the frontend tests — same runner family as Jest, wired into Vite so imports resolve exactly as the app's do:

```ts
// web/src/__tests__/formatters.test.ts
import { formatDuration } from "@/lib/formatters";

describe("formatDuration", () => {
  it("formats hours when present", () => {
    expect(formatDuration(3671)).toBe("1:01:11");
  });
  it("guards non-finite input", () => {
    expect(formatDuration(NaN)).toBe("0:00");
  });
});
```

The `describe`/`it` nesting is the organization; each `it` is one behavior. The existing files cover the pure utilities (`formatters`, `utils`, `haptics`, search history) and the environment contracts (the API-target logic that once shipped a relative URL — 12.4's verify gate has a test beside it). The suite's center of gravity is *pure functions*, mirroring the codebase's design: the impure edges (stores, hooks) are thin adapters, and testing them heavily would test the adapters, not the logic.

## 16.5 Running the gates

```bash
cd api && uv run pytest -q                 # backend — the full suite
cd web && npx vitest run                   # frontend — the full suite
cd web && npx tsc --noEmit                 # types compile (Chapter 5.8's gate)
cd web && npm run build                    # production build + verify gate
```

These four are **the gates**: every change passes them before merge, CI runs them on every push, and a release (17.9) runs them on the release commit. They are also the fastest feedback loop a change has — running them *before* every push is the difference between "CI failed" and "I know it passes."

A test-only change runs its suite; a policy change runs *both* suites plus the guest-policy file by name, because policy regressions are the most expensive kind this codebase has had.

## 16.6 Writing a new test

The procedure, using the backend as the model:

1. **Name the behavior** in the sentence convention. If the name is awkward, the behavior is probably two tests.
2. **Choose the fixture** — `client` (authed), `client_anon` (guest), the token registry (specific identity). The world a test needs is already built.
3. **Arrange, act, assert** — set up minimal state, perform one call, assert the promise *and* (where relevant) one adjacent non-promise (the 401 also implies search still works for guests — assert the adjacent thing when it is cheap).
4. **Run it against the current code first.** A test that passes immediately has either verified existing behavior (fine — regression insurance) or asserted nothing (check the assertions).
5. **Break the code on purpose.** Mutate the behavior under test and watch the test fail. A test that cannot fail is decoration.

The frontend procedure is identical with Vitest spelling. One convention to keep: tests live beside their layer (`__tests__/` for the frontend, `tests/` for the backend) — not scattered next to sources — so "where are the tests for X" has one answer.

## Exercises

1. The suite's shared-cache incident (16.2's note) is worth studying: find the `conftest.py` isolation fix and state, in one sentence, which test property it restored.
2. Write one test pinning that `formatDuration(0)` returns `"0:00"` and one for `formatDuration(-5)`. Which test documents the guard clause?
3. Pick one guest-policy test and trace its fixture path: what does `client_anon` strip, and how does the app know no identity was presented?
4. The endpoint-inventory test enforces an access class per route. Add a hypothetical route to a scratch router and watch the failure message — what does the inventory demand from a new endpoint?
5. A teammate proposes 90% coverage as a goal. Using 16.1's position, write the three-line counter-proposal the project would accept.
