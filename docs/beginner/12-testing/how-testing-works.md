# Testing — What the Suites Prove and How to Add to Them

*Stage 12. Tests are code that runs other code and complains when reality differs from expectation. This repo has two suites and one rule: a change lands only with the tests that pin it.*

## 1. Vocabulary

- **Assertion** — the complaint mechanism: `assert count == 1`. If false, the test fails with your message.
- **Unit test** — one function/decision in isolation (`formatDuration`, `apiTarget`).
- **Integration test** — several pieces through a boundary (an HTTP route hitting mocked storage).
- **Mock** — a stand-in for something slow/external (MongoDB, Clerk, yt-dlp).
- **Fixture** — reusable setup (`client_anon` = an HTTP client with no login).
- **Coverage** — % of code your tests execute. High coverage with weak assertions is theater; this repo optimizes for *behavior-pinning* instead.

## 2. Running the suites

```bash
# backend — 248 tests, ~1 minute
cd api && uv run --with pytest --with pytest-asyncio --with pytest-timeout -m pytest -q
uv run pytest tests/test_guest_policy.py -q        # one file
uv run pytest -q -k "stream and range"             # by keyword

# frontend
cd web && npm test -- --run                        # vitest, all
npx vitest run src/__tests__/apiTarget.test.ts     # one file
```

CI runs the same commands plus `tsc`, `eslint`, and the production build. All binary — pass or no-merge.

## 3. The backend suite — structure and the one file to read first

```
api/tests/
├── conftest.py                ← fixtures + the mock DB + auth token registry
├── test_guest_policy.py       ← THE policy matrix: who can call what
├── test_auth_guard.py         ← account endpoints refuse guests; per-user isolation
├── test_endpoint_inventory.py ← structural: routes ↔ OpenAPI ↔ auth policy
├── test_stream_service.py     ← range parsing, relay, mime inference
├── test_download_ladder.py    ← yt-dlp client fallback
└── …                          ← playlists, analytics, settings, webhooks
```

`conftest.py` does the heavy lifting, and it's worth reading as a lesson in test design:

- **Hermetic environment**: `MUSIC_DIR` points into a temp dir; the durable stream cache is pinned per-run (otherwise yesterday's warmed track "passes" today's test).
- **Auth without Clerk**: `verify_clerk_token` is patched; a token *registry* maps fake tokens → claims, so `client` (Testy), `client_as_other_user`, and `client_anon` coexist in one process. Unknown tokens verify to `None` → 401 — which is exactly what the invalid-token tests rely on.
- **`_clean_state` autouse fixture**: wipes file stores, DB collections, caches between tests. Isolation is why the suite passes in any order.

### Walkthrough — a policy test, line by line

```python
@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,body", STRICT_ANON)
async def test_account_endpoints_refuse_anonymous(client_anon, method, path, body):
    res = await client_anon.request(method, path, json=body)
    assert res.status_code == 401, (
        f"{method} {path} must refuse anonymous callers, got {res.status_code}"
    )
```

1. `@pytest.mark.asyncio` — async tests need it; pytest-asyncio runs them on a loop.
2. `parametrize` — one function becomes 13 tests, each with a readable name in the output.
3. `client_anon` — the fixture: real ASGI app via httpx, no auth header.
4. The assertion message is the *documentation* — when this fails in CI months from now, the message is what you'll read first.

### Walkthrough — a pure-function test (frontend flavor)

The stream cache migration tests (`web/src/__tests__/audioCacheMigration.test.ts`) pin `sniffAudioMime` with real magic numbers: an MP3's first bytes (`ID3` or an 11-bit sync word), m4a's `ftyp`, FLAC's `fLaC`. Pure functions + literal fixtures = tests that never flake. When you write logic that *decides* something, shape it like this: pure core, thin IO shell — then test the core.

## 4. Writing your first test (pattern to copy)

Say you fix a formatter bug. The test travels with it:

```ts
// web/src/__tests__/formatters.test.ts (add alongside the fix)
import { formatDuration } from '@/lib/formatters'

describe('formatDuration', () => {
  it('zero-pads seconds below 10', () => {
    expect(formatDuration(61)).toBe('1:01')   // was '1:1' before the fix
  })
})
```

Backend equivalent for an endpoint change — name the *behavior*, not the function:

```python
@pytest.mark.asyncio
async def test_trending_caps_limit_at_50(client_anon):
    res = await client_anon.get("/api/tracks/trending?limit=500")
    assert res.status_code == 200
    assert len(res.json()) <= 50
```

Checklist for every new test: does it **fail without the fix**? Does it name the rule? Does it leave state clean (the autouse fixture handles files/DB — but not things you invent)?

## 5. Mocking — the etiquette

- Mock **boundaries**, not internals: the DB (conftest does), Clerk verification, yt-dlp execution, network in unit tests.
- Never mock the unit under test.
- Integration-style endpoint tests use the real router + service with mocked externals — that's what makes `test_guest_policy.py` meaningful: it exercises actual FastAPI dependency wiring, not a hand-rolled imitation.

## 6. When a test *should* change

Tests are contracts with the past. Change one only when the *policy or spec* changed, never to make a red suite green — and say so in the commit:

> `test(auth): encode restored guest-first policy — resolve/downloads serve guests`

The git history of `test_auth_guard.py` is a masterclass: it encoded "everything requires auth" when guest mode was removed, then was rewritten to encode the restored matrix, with the commit message explaining the policy reversal. That's the difference between a test suite and a scroll of lies.

## Exercises

1. Run the backend suite, pick any test name, and find the code it pins. Write two sentences: what breaks tomorrow if this test's code is deleted?
2. `test_likes_are_scoped_per_user` uses two clients. Break the isolation deliberately (return a shared user id for all subs) in a scratch branch, run that test, read the failure. Revert.
3. Write the missing test: `formatDuration(3600)` should be `"60:00"`. Run it. Is the current implementation right, or did you just find a real bug? (Decide which, then either fix code or adjust the expectation — and know *why*.)
4. Frontend: add a test for `semverGt` in `versionCheck.ts` — table of (a, b, expected). Notice it's an unexported function; how do you test it without exporting? (Hint: test through `checkForUpdate`, or propose exporting pure helpers — the repo pattern.)
